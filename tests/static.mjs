#!/usr/bin/env node

import assert from "node:assert/strict";
import { pbkdf2Sync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testsDirectory, "..");
const webRoot = path.join(repositoryRoot, "BackendApp", "wwwroot");
const seedPath = path.join(repositoryRoot, "BackendApp", "Data", "seed.json");

const requiredFiles = [
  "BackendApp/BackendApp.csproj",
  "BackendApp/Program.cs",
  "BackendApp/Data/seed.json",
  "BackendApp/wwwroot/index.html",
  "BackendApp/wwwroot/product.html",
  "BackendApp/wwwroot/seller.html",
  "BackendApp/wwwroot/admin.html",
  "BackendApp/wwwroot/assets/css/styles.css",
  "tests/smoke.mjs",
];

for (const relativePath of requiredFiles) {
  await assertFile(path.join(repositoryRoot, relativePath), `Thiếu file bắt buộc: ${relativePath}`);
}

const htmlFiles = await filesWithExtension(webRoot, ".html");
const javaScriptFiles = await filesWithExtension(path.join(webRoot, "assets", "js"), ".js");
assert.equal(htmlFiles.length, 4, "Frontend phải có đúng bốn trang HTML chính.");
assert.ok(javaScriptFiles.length >= 1, "Không tìm thấy JavaScript frontend.");

for (const htmlPath of htmlFiles) {
  await validateHtml(htmlPath);
}

for (const javaScriptPath of javaScriptFiles) {
  await validateJavaScript(javaScriptPath);
}

await validateCss(path.join(webRoot, "assets", "css", "styles.css"));
await validateSeed();
await validateCartBehavior();
await validateRepositoryHygiene();

console.log(
  `Static verification passed: ${htmlFiles.length} HTML pages, `
  + `${javaScriptFiles.length} JavaScript modules, cart behavior, seed data and repository hygiene.`,
);

async function validateHtml(filePath) {
  const source = await readFile(filePath, "utf8");
  const label = path.relative(repositoryRoot, filePath);
  assert.match(source, /^<!doctype html>/i, `${label}: thiếu doctype HTML5.`);
  assert.match(source, /<html\b[^>]*\blang=["']vi["']/i, `${label}: thiếu lang="vi".`);
  assert.match(source, /<meta\b[^>]*\bcharset=["']?utf-8/i, `${label}: thiếu UTF-8 charset.`);
  assert.match(source, /<meta\b[^>]*\bname=["']viewport["']/i, `${label}: thiếu viewport.`);
  assert.match(source, /<main\b[^>]*\bid=["']main-content["']/i, `${label}: thiếu main content target.`);
  assert.match(source, /class=["'][^"']*skip-link/i, `${label}: thiếu skip link.`);
  assert.doesNotMatch(source, /<style\b/i, `${label}: không dùng inline style block vì CSP.`);
  assert.doesNotMatch(source, /\sstyle\s*=/i, `${label}: không dùng inline style attribute vì CSP.`);
  assert.doesNotMatch(source, /\son[a-z]+\s*=/i, `${label}: không dùng inline event handler.`);
  assert.doesNotMatch(source, /javascript\s*:/i, `${label}: không dùng javascript: URL.`);

  const ids = [...source.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicateIds)], [], `${label}: có id HTML trùng.`);

  for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attributes = match[1];
    assert.match(attributes, /\bsrc\s*=\s*["'][^"']+["']/i, `${label}: script phải nằm trong file riêng.`);
    assert.match(attributes, /\btype\s*=\s*["']module["']/i, `${label}: script frontend phải là ES module.`);
    assert.equal(match[2].trim(), "", `${label}: script tag không được chứa code inline.`);
  }

  const references = [...source.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)]
    .map((match) => match[1]);
  for (const reference of references) {
    await validateLocalReference(reference, label);
  }
}

async function validateLocalReference(reference, sourceLabel) {
  if (!reference || reference.startsWith("#")) return;
  const url = new URL(reference, "http://drugstore.local/");
  if (url.origin !== "http://drugstore.local") return;

  const pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") {
    await assertFile(path.join(webRoot, "index.html"), `${sourceLabel}: link trang chủ bị hỏng.`);
    return;
  }

  if (!(pathname.startsWith("/assets/") || pathname.endsWith(".html"))) return;
  const target = path.resolve(webRoot, pathname.replace(/^\/+/, ""));
  assert.ok(
    target === webRoot || target.startsWith(`${webRoot}${path.sep}`),
    `${sourceLabel}: reference vượt khỏi web root: ${reference}`,
  );
  await assertFile(target, `${sourceLabel}: reference không tồn tại: ${reference}`);
}

async function validateJavaScript(filePath) {
  const label = path.relative(repositoryRoot, filePath);
  const syntax = spawnSync(process.execPath, ["--check", filePath], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(syntax.status, 0, `${label}: lỗi cú pháp.\n${syntax.stderr || syntax.stdout}`);

  const source = await readFile(filePath, "utf8");
  assert.doesNotMatch(source, /\.innerHTML\b/, `${label}: không dùng innerHTML.`);
  assert.doesNotMatch(source, /\.insertAdjacentHTML\b/, `${label}: không dùng insertAdjacentHTML.`);
  assert.doesNotMatch(source, /\bdocument\.write\s*\(/, `${label}: không dùng document.write.`);
  assert.doesNotMatch(source, /\beval\s*\(/, `${label}: không dùng eval.`);

  const imports = [
    ...source.matchAll(/\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g),
  ].map((match) => match[1]);
  for (const importPath of imports) {
    if (!importPath.startsWith(".")) continue;
    const target = path.resolve(path.dirname(filePath), importPath);
    await assertFile(target, `${label}: import không tồn tại: ${importPath}`);
  }
}

async function validateCss(filePath) {
  const source = await readFile(filePath, "utf8");
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const opening = (withoutComments.match(/\{/g) || []).length;
  const closing = (withoutComments.match(/\}/g) || []).length;
  assert.equal(opening, closing, "CSS có số ngoặc khối mở/đóng không cân bằng.");
  assert.match(source, /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/i,
    "CSS phải bảo toàn hidden state trên mọi component.");
  assert.match(source, /prefers-reduced-motion/i, "CSS thiếu chế độ reduced motion.");
  assert.match(source, /:focus-visible/i, "CSS thiếu focus-visible.");
}

async function validateSeed() {
  const source = await readFile(seedPath, "utf8");
  const data = JSON.parse(source);
  for (const collection of ["User", "Category", "Product", "Bill", "BillDetail"]) {
    assert.ok(Array.isArray(data[collection]), `Seed.${collection} phải là array.`);
  }
  assert.ok(data.User.length >= 3, "Seed cần đủ tài khoản demo cho ba vai trò.");
  assert.ok(data.Category.length > 0, "Seed phải có danh mục.");
  assert.ok(data.Product.length > 0, "Seed phải có sản phẩm.");

  assertUniquePositiveIds(data.User, "UserID", "User");
  assertUniquePositiveIds(data.Category, "ID_Category", "Category");
  assertUniquePositiveIds(data.Product, "IDProduct", "Product");
  assertUniquePositiveIds(data.Bill, "BillID", "Bill");
  assertUniquePositiveIds(data.BillDetail, "BillDetailID", "BillDetail");

  const users = new Map(data.User.map((user) => [user.UserID, user]));
  const categories = new Set(data.Category.map((category) => category.ID_Category));
  const products = new Map(data.Product.map((product) => [product.IDProduct, product]));
  const bills = new Map(data.Bill.map((bill) => [bill.BillID, bill]));
  for (const product of data.Product) {
    assert.ok(categories.has(product.ID_Category), `Sản phẩm #${product.IDProduct} tham chiếu danh mục không tồn tại.`);
    assert.ok(typeof product.Name === "string" && product.Name.trim(), `Sản phẩm #${product.IDProduct} thiếu tên.`);
    assert.ok(Number.isInteger(product.Price) && product.Price >= 0, `Sản phẩm #${product.IDProduct} phải có giá nguyên đồng hợp lệ.`);
    assert.ok(product.Image_URL?.startsWith("/assets/images/"),
      `Sản phẩm #${product.IDProduct} phải dùng ảnh seed nội bộ.`);
    await validateLocalReference(product.Image_URL, `Seed product #${product.IDProduct}`);
  }
  for (const category of data.Category) {
    assert.ok(
      data.Product.some((product) => product.ID_Category === category.ID_Category),
      `Danh mục #${category.ID_Category} không có sản phẩm mẫu.`,
    );
  }

  for (const detail of data.BillDetail) {
    assert.ok(bills.has(detail.BillID), `BillDetail #${detail.BillDetailID} tham chiếu đơn không tồn tại.`);
    assert.ok(products.has(detail.IDProduct), `BillDetail #${detail.BillDetailID} tham chiếu sản phẩm không tồn tại.`);
    assert.ok(Number.isInteger(detail.Quantity) && detail.Quantity > 0, `BillDetail #${detail.BillDetailID} có số lượng không hợp lệ.`);
    assert.ok(Number.isInteger(detail.Price) && detail.Price >= 0, `BillDetail #${detail.BillDetailID} phải có giá nguyên đồng hợp lệ.`);
    assert.ok(typeof detail.ProductName === "string" && detail.ProductName.trim(),
      `BillDetail #${detail.BillDetailID} thiếu snapshot tên sản phẩm.`);
    assert.ok(typeof detail.Unit === "string" && detail.Unit.trim(),
      `BillDetail #${detail.BillDetailID} thiếu snapshot đơn vị.`);
    assert.ok(typeof detail.RegistrationNumber === "string",
      `BillDetail #${detail.BillDetailID} thiếu snapshot số đăng ký.`);
    await validateLocalReference(detail.Image_URL, `Seed BillDetail #${detail.BillDetailID}`);
  }

  for (const bill of data.Bill) {
    assert.ok(users.has(bill.BuyerID), `Đơn #${bill.BillID} tham chiếu buyer không tồn tại.`);
    assert.ok(bill.StaffID === 0 || users.has(bill.StaffID), `Đơn #${bill.BillID} tham chiếu staff không tồn tại.`);
    assert.ok(["new", "processing", "completed", "cancelled"].includes(bill.Status), `Đơn #${bill.BillID} có trạng thái không hợp lệ.`);
    const subtotal = data.BillDetail
      .filter((detail) => detail.BillID === bill.BillID)
      .reduce((sum, detail) => sum + (detail.Price * detail.Quantity), 0);
    const expectedTotal = Math.round(subtotal * (1 - bill.Discount / 100) * (1 + bill.Tax / 100));
    assert.equal(bill.Total, expectedTotal, `Đơn #${bill.BillID} có tổng tiền sai.`);
  }

  const demoPasswords = new Map([
    ["buyer1", "buyer123"],
    ["staff1", "staff123"],
    ["admin1", "admin123"],
  ]);
  for (const user of data.User) {
    assert.ok(["buyer", "staff", "admin"].includes(user.Role), `User #${user.UserID} có role không hợp lệ.`);
    const match = /^pbkdf2-sha256\$(\d+)\$([^$]+)\$([^$]+)$/.exec(user.Password);
    assert.ok(match, `User #${user.UserID} chưa dùng PBKDF2.`);
    const demoPassword = demoPasswords.get(user.UserName);
    if (!demoPassword) continue;
    const actual = pbkdf2Sync(
      demoPassword,
      Buffer.from(match[2], "base64"),
      Number(match[1]),
      Buffer.from(match[3], "base64").length,
      "sha256",
    );
    assert.deepEqual(actual, Buffer.from(match[3], "base64"), `Password demo của ${user.UserName} không khớp README.`);
    assert.ok(!source.includes(`"Password": "${demoPassword}"`), `Seed làm lộ plaintext của ${user.UserName}.`);
  }
  assert.deepEqual([...new Set(data.User.map((user) => user.Role))].sort(), ["admin", "buyer", "staff"]);
}

async function validateCartBehavior() {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalCustomEvent = globalThis.CustomEvent;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const storage = new Map();
  let failPendingWrites = false;
  let lockRequests = 0;
  let expectedLockRequests = 0;
  let lockTail = Promise.resolve();

  globalThis.window = new EventTarget();
  globalThis.localStorage = {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => {
      if (failPendingWrites && key === "moc-an-checkout-pending-v1") throw new Error("quota");
      storage.set(key, String(value));
    },
    removeItem: (key) => storage.delete(key),
    key: (index) => [...storage.keys()][index] ?? null,
    get length() { return storage.size; },
  };
  globalThis.CustomEvent = class extends Event {
    constructor(type, options = {}) {
      super(type);
      this.detail = options.detail;
    }
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      locks: {
        request: (name, options, callback) => {
          assert.equal(name, "moc-an-cart-write-v1", "Cart mutation phải dùng đúng tên Web Lock.");
          assert.equal(options?.mode, "exclusive", "Cart mutation phải xin Web Lock exclusive.");
          lockRequests += 1;
          const result = lockTail.then(callback, callback);
          lockTail = result.catch(() => undefined);
          return result;
        },
      },
    },
  });

  try {
    const cart = await import(pathToFileURL(path.join(webRoot, "assets", "js", "cart.js")));
    const mutate = async (action) => {
      expectedLockRequests += 1;
      return action();
    };
    const product = (idProduct, name, price) => ({
      idProduct,
      name,
      price,
      unit: "Hộp",
      image_URL: "/assets/images/product-placeholder.svg",
      id_Category: 1,
    });

    await mutate(() => cart.clearCart());
    const emptyToken = cart.getCheckoutToken();
    const emptyRevision = cart.getCartRevision();
    await mutate(() => cart.addToCart(product(1, "Sản phẩm A", 100), 2));
    const firstToken = cart.getCheckoutToken();
    assert.notEqual(firstToken, emptyToken, "Mỗi lần đổi giỏ phải xoay checkout token.");
    assert.equal(cart.getCheckoutToken(), firstToken, "Checkout token phải ổn định khi giỏ không đổi.");
    assert.ok(cart.getCartRevision() > emptyRevision, "Cart revision phải tăng sau thay đổi local.");
    await mutate(() => cart.addToCart(product(2, "Sản phẩm B", 200), 1));
    const checkoutToken = cart.getCheckoutToken();
    assert.notEqual(checkoutToken, firstToken, "Checkout token phải gắn với đúng phiên bản giỏ.");
    const persistedState = JSON.parse(storage.get("moc-an-cart-v1"));
    assert.equal(persistedState.token, checkoutToken, "Cart và checkout token phải được lưu nguyên tử cùng nhau.");
    assert.ok(Array.isArray(persistedState.items), "Cart state đã lưu phải chứa danh sách items.");
    const purchasedSnapshot = cart.getCart();

    // Mô phỏng một tab khác thêm hàng trong lúc request checkout đang chạy.
    await mutate(() => cart.addToCart(product(1, "Sản phẩm A", 100), 1));
    await mutate(() => cart.addToCart(product(3, "Sản phẩm C", 300), 4));
    const tokenBeforeCheckoutCleanup = cart.getCheckoutToken();
    const afterCheckout = await mutate(() => cart.removePurchasedItems(purchasedSnapshot));
    assert.notEqual(cart.getCheckoutToken(), tokenBeforeCheckoutCleanup, "Checkout thành công phải xoay token cho phần giỏ còn lại.");
    assert.deepEqual(
      afterCheckout.map(({ idProduct, quantity }) => ({ idProduct, quantity })),
      [{ idProduct: 1, quantity: 1 }, { idProduct: 3, quantity: 4 }],
      "Checkout không được xóa phần giỏ hàng được thêm trong khi request đang chạy.",
    );

    const tokenBeforeCatalogSync = cart.getCheckoutToken();
    const synchronized = await mutate(() => cart.reconcileCartWithCatalog([
      product(1, "Sản phẩm A mới", 110),
    ]));
    assert.equal(synchronized.changed, 1, "Đồng bộ giỏ phải nhận ra snapshot sản phẩm đã đổi.");
    assert.equal(synchronized.removed, 1, "Đồng bộ giỏ phải bỏ sản phẩm không còn tồn tại.");
    assert.deepEqual(
      synchronized.items.map(({ idProduct, name, price, quantity }) => ({ idProduct, name, price, quantity })),
      [{ idProduct: 1, name: "Sản phẩm A mới", price: 110, quantity: 1 }],
    );
    assert.notEqual(cart.getCheckoutToken(), tokenBeforeCatalogSync, "Đổi giá/order payload phải xoay token.");

    const tokenBeforeMetadataSync = cart.getCheckoutToken();
    const metadataSync = await mutate(() => cart.reconcileCartWithCatalog([
      product(1, "Sản phẩm A đổi tên", 110),
    ]));
    assert.equal(metadataSync.changed, 1);
    assert.equal(cart.getCheckoutToken(), tokenBeforeMetadataSync, "Đổi metadata không được xoay token của cùng order payload.");

    const pendingOrderItems = [{ productID: 1, quantity: 1, expectedUnitPrice: 110 }];
    await mutate(() => cart.savePendingCheckout(7, {
      token: tokenBeforeMetadataSync,
      orderItems: pendingOrderItems,
      cartItems: cart.getCart(),
    }));
    assert.deepEqual(cart.getPendingCheckout(7)?.orderItems, pendingOrderItems, "Pending checkout phải đọc lại đúng payload.");
    const competingPending = await mutate(() => cart.savePendingCheckout(7, {
      token: "cart-competing-000000000000001",
      orderItems: [{ productID: 1, quantity: 2, expectedUnitPrice: 110 }],
      cartItems: cart.getCart(),
    }));
    assert.equal(competingPending.token, tokenBeforeMetadataSync,
      "Hai tab không được ghi đè pending checkout chưa giải quyết của cùng buyer.");
    await mutate(() => cart.clearPendingCheckout(7, "cart-wrong-0000000000000000"));
    assert.ok(cart.getPendingCheckout(7), "Token khác không được xóa pending checkout.");
    await mutate(() => cart.clearPendingCheckout(7, tokenBeforeMetadataSync));
    assert.equal(cart.getPendingCheckout(7), null, "Pending checkout phải được dọn bằng đúng token.");

    failPendingWrites = true;
    await assert.rejects(
      () => mutate(() => cart.savePendingCheckout(8, {
        token: tokenBeforeMetadataSync,
        orderItems: pendingOrderItems,
        cartItems: cart.getCart(),
      })),
      /Không thể lưu checkout an toàn/,
      "Checkout không được POST tiếp nếu browser không lưu bền pending attempt.",
    );
    failPendingWrites = false;
    assert.equal(cart.getPendingCheckout(8), null, "Pending ghi lỗi không được tồn tại giả trong bộ nhớ.");

    const cleanupSnapshot = cart.getCart();
    const cleanupToken = cart.getCheckoutToken();
    await mutate(() => cart.removePurchasedItems(cleanupSnapshot, cleanupToken, 7));
    await mutate(() => cart.addToCart(product(1, "Sản phẩm A đổi tên", 110), 2));
    const afterRepeatedCleanup = await mutate(() => cart.removePurchasedItems(cleanupSnapshot, cleanupToken, 7));
    assert.equal(afterRepeatedCleanup[0]?.quantity, 2, "Cleanup lặp lại cùng checkout không được trừ hàng mới.");
    expectedLockRequests += 2;
    await Promise.all([cart.changeCartItem(1, 1), cart.changeCartItem(1, 1)]);
    assert.equal(cart.getCart().find((item) => item.idProduct === 1)?.quantity, 4,
      "Hai thay đổi tương đối đồng thời phải được tuần tự hóa, không làm mất lượt tăng.");

    const removedLineSnapshot = cart.getCart();
    const removedLineToken = cart.getCheckoutToken();
    await mutate(() => cart.removeCartItem(1));
    await mutate(() => cart.addToCart(product(1, "Sản phẩm A đổi tên", 110), 4));
    const readdedLine = cart.getCart().find((item) => item.idProduct === 1);
    assert.notEqual(readdedLine?.lineToken, removedLineSnapshot[0]?.lineToken,
      "Xóa rồi thêm lại phải tạo line identity mới.");
    const afterOldCleanup = await mutate(() => cart.removePurchasedItems(removedLineSnapshot, removedLineToken, 9));
    assert.equal(afterOldCleanup.find((item) => item.idProduct === 1)?.quantity, 4,
      "Response checkout cũ không được xóa sản phẩm vừa bị xóa rồi thêm lại.");
    await mutate(() => cart.updateCartItem(1, 3));
    assert.equal(cart.getCart().find((item) => item.idProduct === 1)?.quantity, 3,
      "Cập nhật số lượng tuyệt đối phải đi qua khóa và được lưu.");

    const sources = [];
    const unsubscribe = cart.subscribeCart((_items, metadata) => sources.push(metadata.source));
    await mutate(() => cart.addToCart(product(2, "Sản phẩm B", 200), 1));
    const externalToken = "cart-external-0000000000000001";
    const externalValue = JSON.stringify({
      version: 1,
      token: externalToken,
      appliedCheckouts: [],
      items: [{
        idProduct: 4,
        name: "Sản phẩm D",
        price: 400,
        unit: "Hộp",
        imageURL: "",
        categoryId: 1,
        quantity: 1,
      }],
    });
    storage.set("moc-an-cart-v1", externalValue);
    const storageEvent = new Event("storage");
    Object.defineProperties(storageEvent, {
      key: { value: "moc-an-cart-v1" },
      newValue: { value: externalValue },
    });
    window.dispatchEvent(storageEvent);
    unsubscribe();
    assert.deepEqual(sources, ["local", "storage"], "Cart subscriber phải phân biệt thay đổi local và tab khác.");
    assert.equal(cart.getCartSnapshot().token, externalToken, "Storage event phải áp dụng atomically items và token mới.");
    assert.equal(lockRequests, expectedLockRequests, "Mỗi cart mutation được kiểm thử phải đi qua đúng một Web Lock.");

    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
    const cartModuleUrl = pathToFileURL(path.join(webRoot, "assets", "js", "cart.js")).href;
    const fallbackTabA = await import(`${cartModuleUrl}?fallback-tab=a-${Date.now()}`);
    const fallbackTabB = await import(`${cartModuleUrl}?fallback-tab=b-${Date.now()}`);
    await Promise.all([
      fallbackTabA.changeCartItem(4, 1),
      fallbackTabB.changeCartItem(4, 1),
    ]);
    assert.equal(fallbackTabA.getCart().find((item) => item.idProduct === 4)?.quantity, 3,
      "Hai module/tab dùng khóa localStorage dự phòng không được làm mất lượt tăng.");
    assert.equal(
      [...storage.keys()].filter((key) => key.startsWith("moc-an-cart-lock-v1:")).length,
      0,
      "Khóa localStorage dự phòng phải được giải phóng sau mutation.",
    );
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    if (originalCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = originalCustomEvent;
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
  }
}

function assertUniquePositiveIds(items, property, label) {
  const ids = items.map((item) => item[property]);
  assert.ok(ids.every((id) => Number.isInteger(id) && id > 0), `${label} chứa ID không hợp lệ.`);
  assert.equal(new Set(ids).size, ids.length, `${label} chứa ID trùng.`);
}

async function validateRepositoryHygiene() {
  const gitIgnoreSource = await readFile(path.join(repositoryRoot, ".gitignore"), "utf8");
  const gitIgnoreRules = new Set(
    gitIgnoreSource
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
  for (const requiredRule of ["**/[Bb]in/", "**/[Oo]bj/", "node_modules/"]) {
    assert.ok(gitIgnoreRules.has(requiredRule), `.gitignore thiếu rule artifact: ${requiredRule}`);
  }

  const forbiddenExtensions = new Set([".rar", ".zip", ".7z", ".docx", ".xlsx"]);
  const files = await walk(repositoryRoot, new Set([
    ".git",
    ".agents",
    ".tools",
    "node_modules",
    "bin",
    "obj",
  ]));
  for (const filePath of files) {
    const relative = path.relative(repositoryRoot, filePath);
    assert.ok(!forbiddenExtensions.has(path.extname(filePath).toLowerCase()),
      `Repository còn archive/tài liệu nhị phân dư: ${relative}`);
    const metadata = await stat(filePath);
    assert.ok(metadata.size <= 5 * 1024 * 1024, `File lớn bất thường (>5 MiB): ${relative}`);
  }
}

async function filesWithExtension(directory, extension) {
  return (await walk(directory)).filter((filePath) => path.extname(filePath).toLowerCase() === extension);
}

async function walk(directory, ignoredDirectories = new Set()) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name.toLowerCase())) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(target, ignoredDirectories));
    else if (entry.isFile()) output.push(target);
  }
  return output;
}

async function assertFile(filePath, message) {
  try {
    await access(filePath);
    assert.ok((await stat(filePath)).isFile(), message);
  } catch {
    assert.fail(message);
  }
}
