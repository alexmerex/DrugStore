#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { pbkdf2Sync } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const backendProject = path.resolve(
  process.env.BACKEND_PROJECT ?? path.join(repositoryRoot, 'BackendApp', 'BackendApp.csproj'),
);
const dotnetBin = process.env.DOTNET_BIN || 'dotnet';
const startupTimeoutMs = positiveInteger(
  process.env.TEST_STARTUP_TIMEOUT_MS,
  60_000,
  'TEST_STARTUP_TIMEOUT_MS',
);
const requestTimeoutMs = positiveInteger(
  process.env.TEST_REQUEST_TIMEOUT_MS,
  10_000,
  'TEST_REQUEST_TIMEOUT_MS',
);

const credentials = {
  buyer: {
    username: process.env.BUYER_USERNAME || 'smoke_buyer',
    password: process.env.BUYER_PASSWORD || 'Buyer-pass-123',
    role: 'buyer',
  },
  staff: {
    username: process.env.STAFF_USERNAME || 'smoke_staff',
    password: process.env.STAFF_PASSWORD || 'Staff-pass-123',
    role: 'staff',
  },
  admin: {
    username: process.env.ADMIN_USERNAME || 'smoke_admin',
    password: process.env.ADMIN_PASSWORD || 'Admin-pass-123',
    role: 'admin',
  },
};

let backendProcess;
let backendOutput = '';
let temporaryDirectory;
let temporaryDatabasePath;
let registeredUserId;
let passed = 0;
let total = 0;

class HttpTestError extends Error {}

class ApiClient {
  constructor(baseUrl, label) {
    this.baseUrl = baseUrl;
    this.label = label;
    this.cookies = new Map();
  }

  async request(route, options = {}) {
    const method = options.method ?? 'GET';
    const expected = options.expected ?? 200;
    const headers = new Headers(options.headers);
    const cookieHeader = [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');

    if (cookieHeader) {
      headers.set('cookie', cookieHeader);
    }

    let body;
    if (options.body !== undefined) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(options.body);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    let response;
    try {
      response = await fetch(new URL(route, this.baseUrl), {
        method,
        headers,
        body,
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (error) {
      const detail = error?.name === 'AbortError'
        ? `quá ${requestTimeoutMs}ms`
        : error?.message;
      throw new HttpTestError(`${this.label}: ${method} ${route} thất bại (${detail}).`);
    } finally {
      clearTimeout(timer);
    }

    this.#captureCookies(response.headers);

    const responseText = await response.text();
    let responseBody = null;
    if (responseText) {
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        responseBody = responseText;
      }
    }

    const expectedStatuses = Array.isArray(expected) ? expected : [expected];
    if (!expectedStatuses.includes(response.status)) {
      throw new HttpTestError(
        `${this.label}: ${method} ${route} mong đợi ${expectedStatuses.join('/')}, `
        + `nhận ${response.status}. Phản hồi: ${formatValue(responseBody)}`,
      );
    }

    if (responseBody && typeof responseBody === 'object') {
      assertNoPasswordFields(responseBody, `${method} ${route}`);
      assertNoPlaintextPasswords(responseBody, `${method} ${route}`);
    }

    return {
      status: response.status,
      headers: response.headers,
      body: responseBody,
    };
  }

  #captureCookies(headers) {
    const setCookieHeaders = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [headers.get('set-cookie')].filter(Boolean);

    for (const setCookie of setCookieHeaders) {
      const firstPart = setCookie.split(';', 1)[0];
      const separator = firstPart.indexOf('=');
      if (separator < 1) continue;
      const name = firstPart.slice(0, separator).trim();
      const value = firstPart.slice(separator + 1).trim();
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
  }
}

async function main() {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Cần Node.js 18 trở lên (built-in fetch không tồn tại).');
  }

  const externallyManagedUrl = process.env.BASE_URL?.trim();
  let baseUrl;

  if (externallyManagedUrl) {
    baseUrl = normalizeBaseUrl(externallyManagedUrl);
    ensureLocalTarget(baseUrl);
    if (process.env.ALLOW_MUTATING_EXTERNAL !== '1') {
      throw new Error(
        'BASE_URL mode thay đổi dữ liệu và auth quota. Đặt ALLOW_MUTATING_EXTERNAL=1 '
        + 'chỉ khi đây là backend test có thể bỏ dữ liệu.',
      );
    }
    console.log(`Dùng backend có sẵn tại ${baseUrl}`);
  } else {
    const port = process.env.TEST_PORT
      ? validPort(process.env.TEST_PORT)
      : await findAvailablePort();
    baseUrl = `http://127.0.0.1:${port}`;
    await launchBackend(baseUrl);
  }

  const anonymous = new ApiClient(baseUrl, 'anonymous');
  const buyer = new ApiClient(baseUrl, 'buyer');
  const staff = new ApiClient(baseUrl, 'staff');
  const admin = new ApiClient(baseUrl, 'admin');
  let referenceProduct;
  let referenceCategoryId;
  let createdOrderId;

  await check('health endpoint sẵn sàng', async () => {
    const { body } = await anonymous.request('/health');
    assert.equal(body?.status, 'ok');
    assert.equal(typeof body?.service, 'string');
    assert.ok(body.service.length > 0);
    assert.ok(!Number.isNaN(Date.parse(body.time)), 'health.time phải là ngày hợp lệ');
  });

  if (temporaryDatabasePath) {
    await check('data key-only cũ được backfill idempotency fingerprint khi khởi động', async () => {
      const stored = JSON.parse(await readFile(temporaryDatabasePath, 'utf8'));
      const migrated = stored.Bill.find((bill) => bill.BillID === 1);
      assert.equal(migrated?.IdempotencyKey, 'smoke-migration-0000001');
      assert.match(migrated?.IdempotencyFingerprint || '', /^[A-F0-9]{64}$/);
    });
  }

  await check('frontend, tài nguyên và security headers được phục vụ cùng host', async () => {
    const home = await anonymous.request('/');
    assert.equal(typeof home.body, 'string');
    assert.match(home.body, /<title>Mộc An Pharmacy/i);
    assert.match(home.body, /src=["']\/assets\/js\/home\.js["']/i);
    assert.match(home.headers.get('content-security-policy') || '', /default-src 'self'/);
    assert.match(home.headers.get('content-security-policy') || '', /form-action 'self'/);
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(home.headers.get('x-frame-options'), 'DENY');
    assert.match(home.headers.get('permissions-policy') || '', /camera=\(\)/);

    const productPage = await anonymous.request('/product.html?id=1');
    assert.equal(typeof productPage.body, 'string');
    assert.match(productPage.body, /src=["']\/assets\/js\/product\.js["']/i);

    const javaScript = await anonymous.request('/assets/js/home.js');
    assert.equal(typeof javaScript.body, 'string');
    assert.match(javaScript.body, /initShell/);
    assert.match(javaScript.headers.get('content-type') || '', /javascript/i);

    const css = await anonymous.request('/assets/css/styles.css');
    assert.equal(typeof css.body, 'string');
    assert.match(css.body, /--green-800/);
    assert.match(css.headers.get('content-type') || '', /text\/css/i);

    const oldHome = await anonymous.request('/main.html', { expected: 302 });
    assert.equal(new URL(oldHome.headers.get('location'), baseUrl).pathname, '/');
    const oldProduct = await anonymous.request('/thuoc.html?idProduct=1', { expected: 302 });
    assert.equal(oldProduct.headers.get('location'), '/product.html?id=1');
  });

  await check('products và categories là API public', async () => {
    const productsResponse = await anonymous.request('/api/products?limit=20');
    assert.match(productsResponse.headers.get('cache-control') || '', /no-store/i);
    assert.ok(Array.isArray(productsResponse.body), 'products phải là array');
    assert.ok(productsResponse.body.length > 0, 'seed cần ít nhất một sản phẩm');
    referenceProduct = productsResponse.body[0];

    const productId = integerProperty(referenceProduct, 'idProduct', 'iDProduct', 'IDProduct');
    const productResponse = await anonymous.request(`/api/products/${productId}`);
    assert.equal(
      integerProperty(productResponse.body, 'idProduct', 'iDProduct', 'IDProduct'),
      productId,
    );

    const categoriesResponse = await anonymous.request('/api/categories');
    assert.ok(Array.isArray(categoriesResponse.body), 'categories phải là array');
    assert.ok(categoriesResponse.body.length > 0, 'seed cần ít nhất một danh mục');
    referenceCategoryId = integerProperty(
      categoriesResponse.body[0],
      'id_Category',
      'iD_Category',
      'ID_Category',
    );
    assert.equal(typeof categoriesResponse.body[0].productCount, 'number');
  });

  await check('anonymous bị chặn ở endpoint cần đăng nhập', async () => {
    await anonymous.request('/api/orders/mine', { expected: 401 });
    await anonymous.request('/api/users', { expected: 401 });
    await anonymous.request('/api/products', {
      method: 'POST',
      body: productPayload(referenceCategoryId, 'Anonymous must not create this'),
      expected: 401,
    });
    const missing = await anonymous.request('/api/endpoint-khong-ton-tai', { expected: 404 });
    assert.equal(missing.body?.status, 404);
    assert.equal(typeof missing.body?.title, 'string');
  });

  await check('đăng nhập sai trả 401 và không tạo session', async () => {
    const invalid = new ApiClient(baseUrl, 'invalid-login');
    await invalid.request('/api/auth/login', {
      method: 'POST',
      body: {
        username: credentials.buyer.username,
        password: `${credentials.buyer.password}-wrong`,
      },
      expected: 401,
    });
    const { body } = await invalid.request('/api/auth/session');
    assert.equal(body?.authenticated, false);
  });

  await check('xác thực đúng cả ba role buyer/staff/admin', async () => {
    await loginAndVerify(buyer, credentials.buyer);
    await loginAndVerify(staff, credentials.staff);
    await loginAndVerify(admin, credentials.admin);
  });

  await check('khách đăng ký buyer, đọc session rồi đăng xuất', async () => {
    const registrationClient = new ApiClient(baseUrl, 'registration');
    const username = `smoke_registered_${uniqueSuffix()}`;
    const password = 'Registered-pass-123';
    const response = await registrationClient.request('/api/auth/register', {
      method: 'POST',
      body: { username, password },
      expected: 201,
    });
    const user = property(response.body, 'user', 'User');
    registeredUserId = integerProperty(user, 'userID', 'userId', 'UserID');
    assert.equal(stringProperty(user, 'username', 'userName', 'UserName'), username);
    assert.equal(stringProperty(user, 'role', 'Role'), 'buyer');
    assert.match(response.headers.get('set-cookie') || '', /HttpOnly/i);
    if (temporaryDatabasePath) {
      await assertStoredPbkdf2(username, password);
    }

    const session = await registrationClient.request('/api/auth/session');
    assert.equal(session.body?.authenticated, true);
    await registrationClient.request('/api/auth/logout', { method: 'POST', expected: 204 });
    const signedOut = await registrationClient.request('/api/auth/session');
    assert.equal(signedOut.body?.authenticated, false);
  });

  await check('role policy trả 403 cho tài khoản không đủ quyền', async () => {
    await buyer.request('/api/users', { expected: 403 });
    await buyer.request('/api/products', {
      method: 'POST',
      body: productPayload(referenceCategoryId, 'Buyer must not create this'),
      expected: 403,
    });
    await staff.request('/api/users', { expected: 403 });
    await staff.request('/api/orders', {
      method: 'POST',
      body: { items: [{ productID: productIdOf(referenceProduct), quantity: 1 }] },
      expected: 403,
    });
  });

  await check('tên chỉ đủ dài nhờ khoảng trắng bị từ chối bằng 400', async () => {
    const product = await staff.request('/api/products', {
      method: 'POST',
      body: productPayload(referenceCategoryId, ' a '),
      expected: 400,
    });
    assert.equal(product.body?.status, 400);

    const category = await staff.request('/api/categories', {
      method: 'POST',
      body: { name: ' a ' },
      expected: 400,
    });
    assert.equal(category.body?.status, 400);

    const missingStatus = await buyer.request(`/api/orders/${createdOrderId ?? 1}/status`, {
      method: 'PATCH',
      body: {},
      expected: 400,
    });
    assert.equal(missingStatus.body?.status, 400);

    const nullLine = await buyer.request('/api/orders', {
      method: 'POST',
      body: { items: [null] },
      expected: 400,
    });
    assert.equal(nullLine.body?.status, 400);

    const invalidCheckoutKey = await buyer.request('/api/orders', {
      method: 'POST',
      body: {
        items: [{ productID: productIdOf(referenceProduct), quantity: 1 }],
        idempotencyKey: 'too-short',
      },
      expected: 400,
    });
    assert.equal(invalidCheckoutKey.body?.status, 400);

    const fractionalExpectedPrice = await buyer.request('/api/orders', {
      method: 'POST',
      body: {
        items: [{
          productID: productIdOf(referenceProduct),
          quantity: 1,
          expectedUnitPrice: 10.5,
        }],
      },
      expected: 400,
    });
    assert.equal(fractionalExpectedPrice.body?.status, 400);

    const fractionalPrice = await staff.request('/api/products', {
      method: 'POST',
      body: productPayload(referenceCategoryId, 'Fractional price must fail', 10.5),
      expected: 400,
    });
    assert.equal(fractionalPrice.body?.status, 400);
  });

  await check('checkout từ chối nguyên tử khi giá trong giỏ đã cũ', async () => {
    const productID = productIdOf(referenceProduct);
    const unitPrice = numericProperty(referenceProduct, 'price', 'Price');
    const stalePrice = unitPrice < 1_000_000_000 ? unitPrice + 1 : unitPrice - 1;
    const before = await buyer.request('/api/orders/mine');
    const conflict = await buyer.request('/api/orders', {
      method: 'POST',
      body: {
        items: [{ productID, quantity: 1, expectedUnitPrice: stalePrice }],
      },
      expected: 409,
    });
    assert.equal(conflict.body?.status, 409);
    assert.equal(conflict.body?.type, '/problems/price-changed');
    assert.match(conflict.body?.title || '', /giá sản phẩm đã thay đổi/i);
    const after = await buyer.request('/api/orders/mine');
    assert.equal(after.body.length, before.body.length, 'checkout giá cũ không được tạo đơn');
  });

  await check('buyer checkout idempotent đồng thời và đọc lại đơn của mình', async () => {
    const quantity = 2;
    const unitPrice = numericProperty(referenceProduct, 'price', 'Price');
    const idempotencyKey = `smoke-checkout-${uniqueSuffix()}`;
    const checkoutBody = {
      items: [{
        productID: productIdOf(referenceProduct),
        quantity,
        expectedUnitPrice: unitPrice,
      }],
      idempotencyKey,
    };
    const ordersBeforeCheckout = await buyer.request('/api/orders/mine');
    const orderIdsBeforeCheckout = new Set(ordersBeforeCheckout.body.map(
      (order) => integerProperty(order, 'orderID', 'orderId', 'OrderID'),
    ));
    const concurrent = await Promise.all([
      buyer.request('/api/orders', {
        method: 'POST',
        body: checkoutBody,
        expected: [200, 201],
      }),
      buyer.request('/api/orders', {
        method: 'POST',
        body: checkoutBody,
        expected: [200, 201],
      }),
    ]);
    assert.deepEqual(
      concurrent.map((result) => result.status).sort(),
      [200, 201],
      'hai checkout đồng thời phải gồm đúng một create và một replay',
    );
    const response = concurrent.find((result) => result.status === 201);

    createdOrderId = integerProperty(response.body, 'orderID', 'orderId', 'OrderID');
    assert.equal(
      integerProperty(concurrent.find((result) => result.status === 200).body, 'orderID', 'orderId', 'OrderID'),
      createdOrderId,
      'hai checkout đồng thời phải trỏ về cùng một đơn',
    );
    assert.equal(stringProperty(response.body, 'status', 'Status'), 'new');
    assert.equal(numericProperty(response.body, 'total', 'Total'), unitPrice * quantity);
    const items = property(response.body, 'items', 'Items');
    assert.ok(Array.isArray(items) && items.length === 1);
    assert.equal(integerProperty(items[0], 'quantity', 'Quantity'), quantity);
    assert.equal(numericProperty(items[0], 'lineTotal', 'LineTotal'), unitPrice * quantity);

    const retry = await buyer.request('/api/orders', {
      method: 'POST',
      body: checkoutBody,
      expected: 200,
    });
    assert.equal(
      integerProperty(retry.body, 'orderID', 'orderId', 'OrderID'),
      createdOrderId,
      'retry cùng idempotency key phải trả lại đúng đơn cũ',
    );
    const mismatchedRetry = await buyer.request('/api/orders', {
      method: 'POST',
      body: {
        ...checkoutBody,
        items: [{
          productID: productIdOf(referenceProduct),
          quantity: quantity + 1,
          expectedUnitPrice: unitPrice,
        }],
      },
      expected: 409,
    });
    assert.equal(mismatchedRetry.body?.type, '/problems/idempotency-conflict');
    const omittedPriceRetry = await buyer.request('/api/orders', {
      method: 'POST',
      body: {
        ...checkoutBody,
        items: [{ productID: productIdOf(referenceProduct), quantity }],
      },
      expected: 409,
    });
    assert.equal(omittedPriceRetry.body?.type, '/problems/idempotency-conflict');

    const mine = await buyer.request('/api/orders/mine');
    assert.ok(Array.isArray(mine.body));
    assert.ok(
      mine.body.some((order) => integerProperty(order, 'orderID', 'orderId', 'OrderID') === createdOrderId),
      'đơn vừa tạo phải xuất hiện trong /api/orders/mine',
    );
    assert.equal(
      mine.body.filter((order) => integerProperty(order, 'orderID', 'orderId', 'OrderID') === createdOrderId).length,
      1,
      'retry không được tạo đơn trùng',
    );
    const newOrderIds = mine.body
      .map((order) => integerProperty(order, 'orderID', 'orderId', 'OrderID'))
      .filter((orderID) => !orderIdsBeforeCheckout.has(orderID));
    assert.deepEqual(newOrderIds, [createdOrderId], 'retry và idempotency conflict chỉ được làm tăng đúng một đơn');

    const byId = await buyer.request(`/api/orders/${createdOrderId}`);
    assert.equal(integerProperty(byId.body, 'orderID', 'orderId', 'OrderID'), createdOrderId);

    const cancelable = await buyer.request('/api/orders', {
      method: 'POST',
      body: {
        items: [{
          productID: productIdOf(referenceProduct),
          quantity: 1,
          expectedUnitPrice: unitPrice,
        }],
        idempotencyKey: `smoke-cancel-${uniqueSuffix()}`,
      },
      expected: 201,
    });
    const cancelableId = integerProperty(cancelable.body, 'orderID', 'orderId', 'OrderID');
    await buyer.request(`/api/orders/${cancelableId}/status`, {
      method: 'PATCH',
      body: { status: 'cancelled' },
      expected: 204,
    });
    const cancelled = await buyer.request(`/api/orders/${cancelableId}`);
    assert.equal(stringProperty(cancelled.body, 'status', 'Status'), 'cancelled');
  });

  await check('staff CRUD sản phẩm đầy đủ', async () => {
    const unique = uniqueSuffix();
    const created = await staff.request('/api/products', {
      method: 'POST',
      body: productPayload(referenceCategoryId, `Smoke product ${unique}`),
      expected: 201,
    });
    const createdId = productIdOf(created.body);
    assert.ok(createdId > 0);

    const updatedName = `Smoke product updated ${unique}`;
    const updatedPayload = productPayload(referenceCategoryId, updatedName, 43_210);
    await staff.request(`/api/products/${createdId}`, {
      method: 'PUT',
      body: updatedPayload,
      expected: 204,
    });

    const fetched = await staff.request(`/api/products/${createdId}`);
    assert.equal(stringProperty(fetched.body, 'name', 'Name'), updatedName);
    assert.equal(numericProperty(fetched.body, 'price', 'Price'), 43_210);

    await staff.request(`/api/products/${createdId}`, {
      method: 'DELETE',
      expected: 204,
    });
    await anonymous.request(`/api/products/${createdId}`, { expected: 404 });
  });

  await check('staff CRUD danh mục và endpoint GET-by-id', async () => {
    const unique = uniqueSuffix();
    const created = await staff.request('/api/categories', {
      method: 'POST',
      body: { name: `Danh mục smoke ${unique}` },
      expected: 201,
    });
    const categoryId = integerProperty(created.body, 'id_Category', 'iD_Category', 'ID_Category');
    const fetched = await anonymous.request(`/api/categories/${categoryId}`);
    assert.equal(stringProperty(fetched.body, 'name', 'Name'), `Danh mục smoke ${unique}`);

    const updatedName = `Danh mục đã sửa ${unique}`;
    await staff.request(`/api/categories/${categoryId}`, {
      method: 'PUT',
      body: { name: updatedName },
      expected: 204,
    });
    const updated = await anonymous.request(`/api/categories/${categoryId}`);
    assert.equal(stringProperty(updated.body, 'name', 'Name'), updatedName);

    await staff.request(`/api/categories/${categoryId}`, { method: 'DELETE', expected: 204 });
    await anonymous.request(`/api/categories/${categoryId}`, { expected: 404 });
  });

  await check('đơn hàng giữ toàn bộ snapshot sản phẩm sau khi catalog thay đổi', async () => {
    const unique = uniqueSuffix();
    const originalName = `Snapshot product ${unique}`;
    const createdProduct = await staff.request('/api/products', {
      method: 'POST',
      body: productPayload(referenceCategoryId, originalName, 54_321),
      expected: 201,
    });
    const snapshotProductId = productIdOf(createdProduct.body);
    const originalUnit = stringProperty(createdProduct.body, 'unit', 'Unit');
    const originalImage = stringProperty(createdProduct.body, 'image_URL', 'imageURL', 'Image_URL');
    const originalRegistration = stringProperty(createdProduct.body, 'registrationNumber', 'RegistrationNumber');
    const originalPrice = numericProperty(createdProduct.body, 'price', 'Price');
    const createdOrder = await buyer.request('/api/orders', {
      method: 'POST',
      body: {
        items: [{
          productID: snapshotProductId,
          quantity: 1,
          expectedUnitPrice: originalPrice,
        }],
        idempotencyKey: `smoke-snapshot-${uniqueSuffix()}`,
      },
      expected: 201,
    });
    const snapshotOrderId = integerProperty(createdOrder.body, 'orderID', 'orderId', 'OrderID');

    const replacement = productPayload(referenceCategoryId, `Renamed ${unique}`, 98_765);
    replacement.unit = 'Chai';
    replacement.image_URL = '/assets/images/DSC_09324_db795e136a.webp';
    replacement.registrationNumber = `REPLACED-${unique}`;
    await staff.request(`/api/products/${snapshotProductId}`, {
      method: 'PUT',
      body: replacement,
      expected: 204,
    });
    const order = await buyer.request(`/api/orders/${snapshotOrderId}`);
    const items = property(order.body, 'items', 'Items');
    assert.equal(stringProperty(items[0], 'productName', 'ProductName'), originalName);
    assert.equal(stringProperty(items[0], 'unit', 'Unit'), originalUnit);
    assert.equal(stringProperty(items[0], 'imageURL', 'imageUrl', 'ImageURL'), originalImage);
    assert.equal(stringProperty(items[0], 'registrationNumber', 'RegistrationNumber'), originalRegistration);
    assert.equal(numericProperty(items[0], 'unitPrice', 'UnitPrice'), originalPrice);
    assert.equal(numericProperty(items[0], 'lineTotal', 'LineTotal'), originalPrice);
  });

  await check('staff xem đơn và cập nhật vòng đời trạng thái', async () => {
    const allOrders = await staff.request('/api/orders');
    assert.ok(Array.isArray(allOrders.body));
    assert.ok(
      allOrders.body.some(
        (order) => integerProperty(order, 'orderID', 'orderId', 'OrderID') === createdOrderId,
      ),
      'staff phải nhìn thấy đơn buyer vừa tạo',
    );

    await staff.request(`/api/orders/${createdOrderId}/status`, {
      method: 'PATCH',
      body: { status: 'processing' },
      expected: 204,
    });
    await staff.request(`/api/orders/${createdOrderId}/status`, {
      method: 'PATCH',
      body: { status: 'completed' },
      expected: 204,
    });
    await staff.request(`/api/orders/${createdOrderId}/status`, {
      method: 'PATCH',
      body: { status: 'processing' },
      expected: 409,
    });

    const mine = await buyer.request('/api/orders/mine');
    const completed = mine.body.find(
      (order) => integerProperty(order, 'orderID', 'orderId', 'OrderID') === createdOrderId,
    );
    assert.ok(completed);
    assert.equal(stringProperty(completed, 'status', 'Status'), 'completed');
  });

  await check('admin CRUD user, đổi role và đổi password', async () => {
    const unique = uniqueSuffix();
    const originalUsername = `smoke_created_${unique}`;
    const originalPassword = 'Created-pass-123';
    const updatedUsername = `smoke_updated_${unique}`;
    const updatedPassword = 'Updated-pass-456';

    const before = await admin.request('/api/users');
    assert.ok(Array.isArray(before.body));
    assert.ok(before.body.some((user) => stringProperty(user, 'role', 'Role') === 'admin'));

    const created = await admin.request('/api/users', {
      method: 'POST',
      body: {
        username: originalUsername,
        password: originalPassword,
        role: 'buyer',
      },
      expected: 201,
    });
    const userId = integerProperty(created.body, 'userID', 'userId', 'UserID');
    assert.equal(stringProperty(created.body, 'role', 'Role'), 'buyer');
    if (temporaryDatabasePath) {
      await assertStoredPbkdf2(originalUsername, originalPassword);
    }

    await admin.request(`/api/users/${userId}`, {
      method: 'PUT',
      body: {
        username: updatedUsername,
        password: updatedPassword,
        role: 'staff',
      },
      expected: 204,
    });
    if (temporaryDatabasePath) {
      await assertStoredPbkdf2(updatedUsername, updatedPassword);
    }

    const users = await admin.request('/api/users');
    const updated = users.body.find(
      (user) => integerProperty(user, 'userID', 'userId', 'UserID') === userId,
    );
    assert.ok(updated, 'user vừa cập nhật phải còn trong danh sách');
    assert.equal(stringProperty(updated, 'username', 'userName', 'UserName'), updatedUsername);
    assert.equal(stringProperty(updated, 'role', 'Role'), 'staff');

    const updatedUserClient = new ApiClient(baseUrl, 'updated-user');
    await loginAndVerify(updatedUserClient, {
      username: updatedUsername,
      password: updatedPassword,
      role: 'staff',
    });
    const oldCredentials = new ApiClient(baseUrl, 'old-user-credentials');
    await oldCredentials.request('/api/auth/login', {
      method: 'POST',
      body: { username: originalUsername, password: originalPassword },
      expected: 401,
    });

    await admin.request(`/api/users/${userId}`, {
      method: 'DELETE',
      expected: 204,
    });
    const afterDelete = await admin.request('/api/users');
    assert.ok(
      !afterDelete.body.some(
        (user) => integerProperty(user, 'userID', 'userId', 'UserID') === userId,
      ),
      'user đã xóa không được còn trong danh sách',
    );
    const revokedSession = await updatedUserClient.request('/api/auth/session');
    assert.equal(revokedSession.body?.authenticated, false, 'cookie của user đã xóa phải bị vô hiệu');

    if (registeredUserId) {
      await admin.request(`/api/users/${registeredUserId}`, { method: 'DELETE', expected: 204 });
    }
  });

  await check('API không trả field password hoặc plaintext credential', async () => {
    const users = await admin.request('/api/users');
    assertNoPasswordFields(users.body, 'GET /api/users');
    assertNoPlaintextPasswords(users.body, 'GET /api/users');

    const session = await buyer.request('/api/auth/session');
    assertNoPasswordFields(session.body, 'GET /api/auth/session');
    assertNoPlaintextPasswords(session.body, 'GET /api/auth/session');
  });

  if (temporaryDatabasePath) {
    await check('password trong data file tạm đều được hash PBKDF2', async () => {
      const stored = JSON.parse(await readFile(temporaryDatabasePath, 'utf8'));
      assert.ok(Array.isArray(stored.User));
      assert.ok(stored.User.length >= 3);
      for (const user of stored.User) {
        assert.equal(typeof user.Password, 'string');
        assert.match(user.Password, /^pbkdf2-sha256\$\d+\$[^$]+\$[^$]+$/);
      }
      assertNoPlaintextPasswords(stored, 'temporary database');
    });
  }

  await check('auth rate limit trả ProblemDetails và Retry-After', async () => {
    const limited = new ApiClient(baseUrl, 'rate-limit');
    let rejection = null;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const response = await limited.request('/api/auth/login', {
        method: 'POST',
        body: { username: `missing_${attempt}`, password: 'Wrong-pass-123' },
        expected: [401, 429],
      });
      if (response.status === 429) {
        rejection = response;
        break;
      }
    }
    assert.ok(rejection, 'auth limiter phải từ chối sau khi vượt quota');
    assert.equal(rejection.body?.status, 429);
    assert.equal(typeof rejection.body?.title, 'string');
    assert.ok(Number(rejection.headers.get('retry-after')) >= 1, '429 phải có Retry-After');
  });

  console.log(`\nHoàn tất: ${passed}/${total} nhóm kiểm thử đạt.`);
}

async function launchBackend(baseUrl) {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'drugstore-api-smoke-'));
  temporaryDatabasePath = path.join(temporaryDirectory, 'database.json');
  await mkdir(temporaryDirectory, { recursive: true });
  await writeFile(
    temporaryDatabasePath,
    `${JSON.stringify(createFixture(), null, 2)}\n`,
    'utf8',
  );

  const args = [
    'run',
    '--project',
    backendProject,
    '--no-launch-profile',
    '--',
    '--urls',
    baseUrl,
  ];

  console.log(`Khởi chạy BackendApp tại ${baseUrl}`);
  console.log(`Data test tạm: ${temporaryDatabasePath}`);

  backendProcess = spawn(dotnetBin, args, {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      ASPNETCORE_ENVIRONMENT: 'Testing',
      DOTNET_CLI_TELEMETRY_OPTOUT: '1',
      DOTNET_NOLOGO: '1',
      DrugStore__DataFilePath: temporaryDatabasePath,
    },
    detached: process.platform !== 'win32',
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout.on('data', captureBackendOutput);
  backendProcess.stderr.on('data', captureBackendOutput);
  backendProcess.on('error', (error) => {
    captureBackendOutput(`Không thể launch ${dotnetBin}: ${error.message}\n`);
  });

  await waitForBackend(baseUrl);
}

async function waitForBackend(baseUrl) {
  const deadline = Date.now() + startupTimeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    if (backendProcess.exitCode !== null) {
      throw new Error(
        `Backend thoát sớm với code ${backendProcess.exitCode}.\n${backendOutput.trim()}`,
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1_000);
    try {
      const response = await fetch(`${baseUrl}/health`, { signal: controller.signal });
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }

    await delay(250);
  }

  throw new Error(
    `Backend không sẵn sàng sau ${startupTimeoutMs}ms (${lastError?.message ?? 'unknown'}).\n`
    + backendOutput.trim(),
  );
}

async function loginAndVerify(client, account) {
  const loggedIn = await client.request('/api/auth/login', {
    method: 'POST',
    body: { username: account.username, password: account.password },
  });
  assert.equal(stringProperty(loggedIn.body.user, 'role', 'Role'), account.role);
  assert.equal(
    stringProperty(loggedIn.body.user, 'username', 'userName', 'UserName'),
    account.username,
  );
  const sessionCookie = loggedIn.headers.get('set-cookie') || '';
  assert.match(sessionCookie, /DrugStore\.Session=/i, 'login phải tạo session cookie');
  assert.match(sessionCookie, /HttpOnly/i, 'session cookie phải là HttpOnly');
  assert.match(sessionCookie, /SameSite=Strict/i, 'session cookie phải dùng SameSite=Strict');

  const session = await client.request('/api/auth/session');
  assert.equal(session.body?.authenticated, true);
  assert.equal(stringProperty(session.body.user, 'role', 'Role'), account.role);
  assert.equal(
    stringProperty(session.body.user, 'username', 'userName', 'UserName'),
    account.username,
  );
}

async function assertStoredPbkdf2(username, plaintextPassword) {
  assert.ok(temporaryDatabasePath, 'Kiểm tra hash runtime cần data file tạm.');
  const stored = JSON.parse(await readFile(temporaryDatabasePath, 'utf8'));
  assert.ok(Array.isArray(stored.User), 'Data runtime phải có User array.');
  const user = stored.User.find(
    (candidate) => candidate.UserName?.toLowerCase() === username.toLowerCase(),
  );
  assert.ok(user, `Không tìm thấy user runtime ${username}.`);
  assert.equal(typeof user.Password, 'string');
  assert.notEqual(user.Password, plaintextPassword, `${username} không được lưu plaintext.`);

  const match = /^pbkdf2-sha256\$(\d+)\$([^$]+)\$([^$]+)$/.exec(user.Password);
  assert.ok(match, `${username} phải dùng đúng format PBKDF2-SHA256.`);
  const iterations = Number(match[1]);
  const salt = Buffer.from(match[2], 'base64');
  const expectedHash = Buffer.from(match[3], 'base64');
  assert.ok(
    Number.isSafeInteger(iterations) && iterations >= 100_000,
    `${username} dùng iteration count quá thấp.`,
  );
  assert.ok(salt.length >= 16, `${username} dùng salt quá ngắn.`);
  assert.ok(expectedHash.length >= 32, `${username} dùng derived key quá ngắn.`);

  const actualHash = pbkdf2Sync(
    plaintextPassword,
    salt,
    iterations,
    expectedHash.length,
    'sha256',
  );
  assert.deepEqual(actualHash, expectedHash, `Hash runtime của ${username} không khớp password.`);
}

async function check(name, operation) {
  total += 1;
  try {
    await operation();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    error.message = `✗ ${name}\n${error.message}`;
    throw error;
  }
}

function createFixture() {
  return {
    User: [
      {
        UserID: 1,
        UserName: credentials.buyer.username,
        Role: credentials.buyer.role,
        Password: credentials.buyer.password,
      },
      {
        UserID: 2,
        UserName: credentials.staff.username,
        Role: credentials.staff.role,
        Password: credentials.staff.password,
      },
      {
        UserID: 3,
        UserName: credentials.admin.username,
        Role: credentials.admin.role,
        Password: credentials.admin.password,
      },
    ],
    Category: [
      { ID_Category: 1, Name: 'Danh mục smoke test' },
    ],
    Product: [
      {
        IDProduct: 1,
        Name: 'Sản phẩm fixture cho smoke test',
        ID_Category: 1,
        Price: 12_500,
        Unit: 'Hộp',
        Type: 'Kiểm thử',
        DosageForms: 'Viên',
        Packing: 'Hộp 10 viên',
        BrandOrigin: 'Việt Nam',
        Producer: 'DrugStore Test',
        ManufacturingCountry: 'Việt Nam',
        Ingredient: 'Fixture',
        ShortDescription: 'Chỉ tồn tại trong data file tạm.',
        RegistrationNumber: 'SMOKE-001',
        Image_URL: '/assets/images/DSC_09581_5712979ba0.webp',
      },
    ],
    Bill: [
      {
        BillID: 1,
        BuyerID: 1,
        StaffID: 0,
        Discount: 0,
        Tax: 0,
        Date: '2026-01-01T00:00:00Z',
        Total: 12_500,
        Status: 'new',
        IdempotencyKey: 'smoke-migration-0000001',
      },
    ],
    BillDetail: [
      {
        BillDetailID: 1,
        BillID: 1,
        IDProduct: 1,
        Quantity: 1,
        Price: 12_500,
        ProductName: 'Sản phẩm fixture cho smoke test',
        Unit: 'Hộp',
        RegistrationNumber: 'SMOKE-001',
        Image_URL: '/assets/images/DSC_09581_5712979ba0.webp',
      },
    ],
  };
}

function productPayload(categoryId, name, price = 32_100) {
  return {
    name,
    id_Category: categoryId,
    price,
    unit: 'Hộp',
    type: 'Smoke test',
    dosageForms: 'Viên',
    packing: 'Hộp 20 viên',
    brandOrigin: 'Việt Nam',
    producer: 'DrugStore Smoke',
    manufacturingCountry: 'Việt Nam',
    ingredient: 'Dữ liệu kiểm thử',
    shortDescription: 'Tự động xóa cùng data file tạm.',
    registrationNumber: `SMOKE-${uniqueSuffix()}`,
    image_URL: '/assets/images/DSC_09581_5712979ba0.webp',
  };
}

function productIdOf(product) {
  return integerProperty(product, 'idProduct', 'iDProduct', 'IDProduct');
}

function property(object, ...names) {
  assert.ok(object && typeof object === 'object', `Cần object để đọc ${names.join('/')}`);
  for (const name of names) {
    if (Object.hasOwn(object, name)) return object[name];
  }
  assert.fail(`Thiếu property ${names.join('/')} trong ${formatValue(object)}`);
}

function stringProperty(object, ...names) {
  const value = property(object, ...names);
  assert.equal(typeof value, 'string', `${names[0]} phải là string`);
  return value;
}

function numericProperty(object, ...names) {
  const value = property(object, ...names);
  assert.equal(typeof value, 'number', `${names[0]} phải là number`);
  assert.ok(Number.isFinite(value), `${names[0]} phải hữu hạn`);
  return value;
}

function integerProperty(object, ...names) {
  const value = numericProperty(object, ...names);
  assert.ok(Number.isInteger(value), `${names[0]} phải là integer`);
  return value;
}

function assertNoPasswordFields(value, context, trail = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPasswordFields(item, context, `${trail}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    assert.ok(
      !/password|passwd|pwd|credential|secret/i.test(key),
      `${context} làm lộ field nhạy cảm tại ${trail}.${key}`,
    );
    assertNoPasswordFields(child, context, `${trail}.${key}`);
  }
}

function assertNoPlaintextPasswords(value, context) {
  const serialized = JSON.stringify(value);
  const plaintexts = [
    ...Object.values(credentials).map((account) => account.password),
    'Created-pass-123',
    'Updated-pass-456',
  ];
  for (const plaintext of plaintexts) {
    assert.ok(!serialized.includes(plaintext), `${context} làm lộ plaintext password`);
  }
}

function normalizeBaseUrl(value) {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('BASE_URL chỉ hỗ trợ http hoặc https.');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function ensureLocalTarget(baseUrl) {
  const host = new URL(baseUrl).hostname.toLowerCase();
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error(
      'Smoke test có tạo/xóa dữ liệu nên BASE_URL phải là localhost/loopback. '
      + 'Hãy chạy trên một backend test riêng.',
    );
  }
}

async function findAvailablePort() {
  const server = net.createServer();
  server.unref();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  assert.ok(Number.isInteger(port));
  return port;
}

function validPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('TEST_PORT phải là số nguyên từ 1 đến 65535.');
  }
  return port;
}

function positiveInteger(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} phải là số nguyên dương.`);
  }
  return parsed;
}

function uniqueSuffix() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatValue(value) {
  if (typeof value === 'string') return value.slice(0, 1_000);
  try {
    return JSON.stringify(value)?.slice(0, 1_000) ?? String(value);
  } catch {
    return String(value);
  }
}

function captureBackendOutput(chunk) {
  const text = String(chunk);
  if (process.env.SHOW_BACKEND_LOGS === '1') process.stdout.write(text);
  backendOutput = `${backendOutput}${text}`.slice(-30_000);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function stopBackend() {
  if (!backendProcess || backendProcess.exitCode !== null) return;

  if (process.platform === 'win32') {
    const stopped = spawnSync('taskkill', ['/pid', String(backendProcess.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    if (stopped.status !== 0) {
      try {
        backendProcess.kill('SIGTERM');
      } catch {
        // Process may already have stopped.
      }
    }
    await Promise.race([once(backendProcess, 'exit').catch(() => {}), delay(3_000)]);
    return;
  }

  try {
    process.kill(-backendProcess.pid, 'SIGTERM');
  } catch {
    // Process may already have stopped.
  }

  await Promise.race([once(backendProcess, 'exit').catch(() => {}), delay(3_000)]);
  if (backendProcess.exitCode !== null) return;

  try {
    process.kill(-backendProcess.pid, 'SIGKILL');
  } catch {
    // Process may already have stopped.
  }
}

async function cleanup() {
  await stopBackend();
  if (temporaryDirectory && process.env.KEEP_TEST_DATA !== '1') {
    const expectedPrefix = path.join(os.tmpdir(), 'drugstore-api-smoke-');
    if (!path.resolve(temporaryDirectory).startsWith(path.resolve(expectedPrefix))) {
      throw new Error(`Từ chối xóa temp path ngoài prefix dự kiến: ${temporaryDirectory}`);
    }
    await rm(temporaryDirectory, { recursive: true, force: true });
  } else if (temporaryDirectory) {
    console.log(`Giữ lại data test tại ${temporaryDirectory}`);
  }
}

let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    if (interrupted) return;
    interrupted = true;
    await cleanup().catch(() => {});
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}

try {
  await main();
} catch (error) {
  process.exitCode = 1;
  console.error(`\n${error?.stack ?? error}`);
  if (backendOutput && process.env.SHOW_BACKEND_LOGS !== '1') {
    console.error(`\n--- Backend log (cuối) ---\n${backendOutput.trim()}`);
  }
} finally {
  await cleanup().catch((error) => {
    process.exitCode = 1;
    console.error(`Cleanup thất bại: ${error?.stack ?? error}`);
  });
}
