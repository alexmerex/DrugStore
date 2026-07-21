import { categoryId, imageUrl, productId } from "./utils.js";

const CART_KEY = "moc-an-cart-v1";
const CART_EVENT = "mocan:cart-change";
const CART_LOCK = "moc-an-cart-write-v1";
const CART_LEASE_KEY = "moc-an-cart-lock-v1";
const CART_LOCK_ENTRY_PREFIX = `${CART_LEASE_KEY}:`;
const PENDING_CHECKOUT_KEY = "moc-an-checkout-pending-v1";
let memoryCart = [];
let memoryToken = "";
let memoryAppliedCheckouts = [];
let memoryPendingCheckouts = {};
let storageUnavailable = false;
let pendingStorageUnavailable = false;
let cartRevision = 0;
let fallbackTokenSequence = 0;
let fallbackLockTail = Promise.resolve();

function clampQuantity(value, minimum = 1, fallback = minimum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(99, Math.max(minimum, Math.trunc(numeric)));
}

function normalizeLineToken(value, productID) {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{15,99}$/.test(token)
    ? token
    : `legacy-line-product-${productID}`;
}

function normalizeItem(item) {
  const id = Number(item?.idProduct);
  const quantity = clampQuantity(item?.quantity);
  if (!Number.isInteger(id) || id < 1) return null;
  return {
    idProduct: id,
    name: String(item?.name || "Sản phẩm"),
    price: Math.max(0, Number(item?.price) || 0),
    unit: String(item?.unit || "sản phẩm"),
    imageURL: String(item?.imageURL || ""),
    categoryId: Number(item?.categoryId) || 0,
    lineToken: normalizeLineToken(item?.lineToken, id),
    quantity
  };
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  const normalized = [];
  const byProduct = new Map();
  for (const rawItem of items) {
    const item = normalizeItem(rawItem);
    if (!item) continue;
    const existing = byProduct.get(item.idProduct);
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + item.quantity);
      continue;
    }
    if (normalized.length >= 100) continue;
    byProduct.set(item.idProduct, item);
    normalized.push(item);
  }
  return normalized;
}

function cloneItems(items) {
  return items.map((item) => ({ ...item }));
}

function orderSignature(items) {
  return JSON.stringify(normalizeItems(items)
    .map((item) => [item.idProduct, item.quantity, item.price])
    .sort((first, second) => first[0] - second[0]));
}

function legacyToken(items) {
  const source = JSON.stringify(items);
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `legacy-${(first >>> 0).toString(16).padStart(8, "0")}-${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function createCartToken() {
  if (globalThis.crypto?.randomUUID) return `cart-${globalThis.crypto.randomUUID()}`;
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return `cart-${[...bytes].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  }
  fallbackTokenSequence += 1;
  return `cart-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${fallbackTokenSequence.toString(36)}`;
}

function normalizeToken(value, items) {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{15,99}$/.test(token) ? token : legacyToken(items);
}

function parseStoredState(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    const legacy = Array.isArray(parsed);
    const items = normalizeItems(legacy ? parsed : parsed?.items);
    const appliedCheckouts = legacy || !Array.isArray(parsed?.appliedCheckouts)
      ? []
      : parsed.appliedCheckouts
        .map((entry) => String(entry || ""))
        .filter((entry) => /^\d+:[A-Za-z0-9][A-Za-z0-9._:-]{15,99}$/.test(entry))
        .slice(-50);
    return {
      items,
      token: normalizeToken(legacy ? "" : parsed?.token, items),
      appliedCheckouts
    };
  } catch {
    return { items: [], token: legacyToken([]), appliedCheckouts: [] };
  }
}

export function getCart() {
  if (storageUnavailable) {
    if (!memoryToken) memoryToken = legacyToken(memoryCart);
    return memoryCart.map((item) => ({ ...item }));
  }
  try {
    const state = parseStoredState(localStorage.getItem(CART_KEY));
    if (memoryToken && state.token !== memoryToken) cartRevision += 1;
    memoryCart = state.items;
    memoryToken = state.token;
    memoryAppliedCheckouts = state.appliedCheckouts;
    return cloneItems(memoryCart);
  } catch {
    storageUnavailable = true;
    if (!memoryToken) memoryToken = legacyToken(memoryCart);
    return cloneItems(memoryCart);
  }
}

function persist(items) {
  const normalized = normalizeItems(items);
  const orderChanged = orderSignature(normalized) !== orderSignature(memoryCart);
  memoryCart = normalized;
  if (!memoryToken || orderChanged) memoryToken = createCartToken();
  cartRevision += 1;
  try {
    localStorage.setItem(CART_KEY, JSON.stringify({
      version: 1,
      token: memoryToken,
      items: normalized,
      appliedCheckouts: memoryAppliedCheckouts
    }));
    storageUnavailable = false;
  } catch {
    storageUnavailable = true;
  }
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: cloneItems(normalized) }));
  return cloneItems(normalized);
}

function queueFallbackLock(callback) {
  const result = fallbackLockTail.then(callback, callback);
  fallbackLockTail = result.catch(() => undefined);
  return result;
}

const wait = (milliseconds) => new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));

function readLockEntries() {
  const entries = [];
  const expiredKeys = [];
  const now = Date.now();
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(CART_LOCK_ENTRY_PREFIX)) continue;
    try {
      const entry = JSON.parse(localStorage.getItem(key) || "null");
      if (!entry?.owner || Number(entry.expiresAt) <= now) {
        expiredKeys.push(key);
        continue;
      }
      const ticket = Number(entry.ticket);
      if (!Number.isSafeInteger(ticket) || ticket < 0) {
        expiredKeys.push(key);
        continue;
      }
      entries.push({
        key,
        owner: String(entry.owner),
        choosing: Boolean(entry.choosing),
        ticket
      });
    } catch {
      expiredKeys.push(key);
    }
  }
  expiredKeys.forEach((key) => localStorage.removeItem(key));
  return entries;
}

function lockEntry(owner, ticket, choosing) {
  return JSON.stringify({
    owner,
    ticket,
    choosing,
    expiresAt: Date.now() + 10_000
  });
}

async function withStorageLease(callback) {
  return queueFallbackLock(async () => {
    const owner = createCartToken();
    const ownKey = `${CART_LOCK_ENTRY_PREFIX}${owner}`;
    let ticket;
    try {
      localStorage.setItem(ownKey, lockEntry(owner, 0, true));
      ticket = 1 + readLockEntries().reduce((maximum, entry) => Math.max(maximum, entry.ticket), 0);
      localStorage.setItem(ownKey, lockEntry(owner, ticket, false));
    } catch {
      try { localStorage.removeItem(ownKey); } catch { /* Shared storage is unavailable. */ }
      throw new Error("Không thể khóa giỏ hàng an toàn trên trình duyệt này.");
    }

    try {
      await wait(0);
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        const blocked = readLockEntries().some((entry) => {
          if (entry.owner === owner) return false;
          if (entry.choosing) return true;
          return entry.ticket < ticket || (entry.ticket === ticket && entry.owner < owner);
        });
        if (!blocked) return await callback();
        localStorage.setItem(ownKey, lockEntry(owner, ticket, false));
        await wait(12 + Math.floor(Math.random() * 12));
      }
      throw new Error("Giỏ hàng đang được cập nhật ở tab khác. Vui lòng thử lại.");
    } finally {
      try {
        const latest = JSON.parse(localStorage.getItem(ownKey) || "null");
        if (latest?.owner === owner) localStorage.removeItem(ownKey);
      } catch {
        // Entry sẽ tự hết hạn nếu shared storage không còn đọc được.
      }
    }
  });
}

async function withCartLock(callback) {
  const locks = globalThis.navigator?.locks;
  if (locks?.request) {
    return locks.request(CART_LOCK, { mode: "exclusive" }, callback);
  }
  return withStorageLease(callback);
}

export function getCartRevision() {
  return cartRevision;
}

export function getCheckoutToken() {
  return getCartSnapshot().token;
}

export function getCartSnapshot() {
  const items = getCart();
  if (!memoryToken) memoryToken = legacyToken(items);
  return { items, token: memoryToken, revision: cartRevision };
}

export async function reconcileCartWithCatalog(products, expectedToken = "") {
  return withCartLock(() => {
    const snapshot = getCartSnapshot();
    if (expectedToken && snapshot.token !== expectedToken) {
      return { changed: 0, removed: 0, items: snapshot.items, cartChanged: true };
    }
    if (!Array.isArray(products)) {
      return { changed: 0, removed: 0, items: snapshot.items, cartChanged: false };
    }

    const catalog = new Map();
    products.forEach((product) => {
      const id = productId(product);
      if (Number.isInteger(id) && id > 0) catalog.set(id, product);
    });

    let changed = 0;
    let removed = 0;
    const items = [];

    snapshot.items.forEach((item) => {
      const product = catalog.get(item.idProduct);
      if (!product) {
        removed += 1;
        return;
      }

      const nextItem = normalizeItem({
        idProduct: item.idProduct,
        name: String(product.name || "Sản phẩm"),
        price: Math.max(0, Number(product.price) || 0),
        unit: String(product.unit || "sản phẩm"),
        imageURL: imageUrl(product),
        categoryId: categoryId(product),
        lineToken: item.lineToken,
        quantity: item.quantity
      });

      if (!nextItem) {
        removed += 1;
        return;
      }

      if (
        nextItem.name !== item.name
        || nextItem.price !== item.price
        || nextItem.unit !== item.unit
        || nextItem.imageURL !== item.imageURL
        || nextItem.categoryId !== item.categoryId
        || nextItem.quantity !== item.quantity
      ) {
        changed += 1;
      }
      items.push(nextItem);
    });

    if (!changed && !removed) {
      return { changed, removed, items: cloneItems(items), cartChanged: false };
    }
    return { changed, removed, items: persist(items), cartChanged: false };
  });
}

export async function addToCart(product, quantity = 1) {
  return withCartLock(() => {
    const id = productId(product);
    if (!id) return getCart();
    const items = getCart();
    const current = items.find((item) => item.idProduct === id);
    const amount = clampQuantity(quantity);
    if (current) {
      const nextQuantity = Math.min(99, current.quantity + amount);
      if (nextQuantity === current.quantity) return items;
      current.quantity = nextQuantity;
    } else {
      if (items.length >= 100) {
        throw new Error("Giỏ hàng chỉ hỗ trợ tối đa 100 sản phẩm khác nhau.");
      }
      items.push({
        idProduct: id,
        name: String(product.name || "Sản phẩm"),
        price: Math.max(0, Number(product.price) || 0),
        unit: String(product.unit || "sản phẩm"),
        imageURL: imageUrl(product),
        categoryId: categoryId(product),
        lineToken: createCartToken(),
        quantity: amount
      });
    }
    return persist(items);
  });
}

export async function updateCartItem(id, quantity) {
  return withCartLock(() => {
    const normalizedId = Number(id);
    const items = getCart();
    const current = items.find((item) => item.idProduct === normalizedId);
    if (!current) return items;
    const nextQuantity = clampQuantity(quantity, 0, 0);
    if (nextQuantity === 0) return persist(items.filter((item) => item.idProduct !== normalizedId));
    if (nextQuantity === current.quantity) return items;
    current.quantity = nextQuantity;
    return persist(items);
  });
}

export async function changeCartItem(id, delta) {
  return withCartLock(() => {
    const normalizedId = Number(id);
    const amount = Number(delta);
    const items = getCart();
    const current = items.find((item) => item.idProduct === normalizedId);
    if (!current || !Number.isFinite(amount)) return items;
    const nextQuantity = clampQuantity(current.quantity + Math.trunc(amount), 0, current.quantity);
    if (nextQuantity === 0) return persist(items.filter((item) => item.idProduct !== normalizedId));
    if (nextQuantity === current.quantity) return items;
    current.quantity = nextQuantity;
    return persist(items);
  });
}

export async function removeCartItem(id) {
  return withCartLock(() => {
    const items = getCart();
    const remaining = items.filter((item) => item.idProduct !== Number(id));
    return remaining.length === items.length ? items : persist(remaining);
  });
}

export async function clearCart() {
  return withCartLock(() => getCart().length ? persist([]) : []);
}

export async function removePurchasedItems(purchasedItems, checkoutToken = "", userId = 0) {
  return withCartLock(() => {
    const normalizedUserId = Number(userId);
    const normalizedToken = String(checkoutToken || "").trim();
    const checkoutIdentity = Number.isInteger(normalizedUserId) && normalizedUserId > 0
      && /^[A-Za-z0-9][A-Za-z0-9._:-]{15,99}$/.test(normalizedToken)
      ? `${normalizedUserId}:${normalizedToken}`
      : "";
    const currentItems = getCart();
    if (checkoutIdentity && memoryAppliedCheckouts.includes(checkoutIdentity)) return currentItems;
    const purchasedLines = new Map();
    normalizeItems(purchasedItems).forEach((item) => {
      purchasedLines.set(item.idProduct, { lineToken: item.lineToken, quantity: item.quantity });
    });
    const remaining = currentItems.flatMap((item) => {
      const purchased = purchasedLines.get(item.idProduct);
      if (!purchased || purchased.lineToken !== item.lineToken) return [item];
      const quantity = item.quantity - purchased.quantity;
      return quantity > 0 ? [{ ...item, lineToken: createCartToken(), quantity }] : [];
    });
    if (checkoutIdentity) {
      memoryAppliedCheckouts = [...memoryAppliedCheckouts, checkoutIdentity].slice(-50);
    }
    return persist(remaining);
  });
}

function readPendingState() {
  if (pendingStorageUnavailable) return { ...memoryPendingCheckouts };
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_CHECKOUT_KEY) || "{}");
    memoryPendingCheckouts = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    return { ...memoryPendingCheckouts };
  } catch {
    pendingStorageUnavailable = true;
    return { ...memoryPendingCheckouts };
  }
}

function writePendingState(state) {
  try {
    localStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(state));
    memoryPendingCheckouts = state;
    pendingStorageUnavailable = false;
  } catch {
    pendingStorageUnavailable = true;
    throw new Error("Không thể lưu checkout an toàn trên trình duyệt này.");
  }
}

function normalizePendingOrderItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) return null;
  const normalized = items.map((item) => ({
    productID: Number(item?.productID),
    quantity: Number(item?.quantity),
    expectedUnitPrice: Number(item?.expectedUnitPrice)
  }));
  return normalized.every((item) =>
    Number.isInteger(item.productID) && item.productID > 0
    && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 99
    && Number.isInteger(item.expectedUnitPrice)
    && item.expectedUnitPrice >= 0 && item.expectedUnitPrice <= 1_000_000_000)
    ? normalized
    : null;
}

function normalizePendingCheckout(record) {
  const token = String(record?.token || "").trim();
  const orderItems = normalizePendingOrderItems(record?.orderItems);
  const cartItems = normalizeItems(record?.cartItems);
  const createdAt = Number(record?.createdAt);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,99}$/.test(token)
    || !orderItems
    || cartItems.length < 1
    || !Number.isFinite(createdAt)
    || createdAt <= 0
    || createdAt > Date.now() + 60_000) {
    return null;
  }
  return { token, orderItems, cartItems, createdAt };
}

export function getPendingCheckout(userId) {
  const normalizedUserId = Number(userId);
  if (!Number.isInteger(normalizedUserId) || normalizedUserId < 1) return null;
  const record = normalizePendingCheckout(readPendingState()[String(normalizedUserId)]);
  return record ? {
    ...record,
    orderItems: record.orderItems.map((item) => ({ ...item })),
    cartItems: cloneItems(record.cartItems)
  } : null;
}

export async function savePendingCheckout(userId, attempt) {
  const normalizedUserId = Number(userId);
  const record = normalizePendingCheckout({ ...attempt, createdAt: Date.now() });
  if (!Number.isInteger(normalizedUserId) || normalizedUserId < 1 || !record) {
    throw new Error("Không thể lưu trạng thái checkout để chống tạo đơn trùng.");
  }
  return withCartLock(() => {
    const state = readPendingState();
    const key = String(normalizedUserId);
    const existing = normalizePendingCheckout(state[key]);
    if (existing) {
      return {
        ...existing,
        orderItems: existing.orderItems.map((item) => ({ ...item })),
        cartItems: cloneItems(existing.cartItems)
      };
    }
    state[key] = record;
    writePendingState(state);
    return {
      ...record,
      orderItems: record.orderItems.map((item) => ({ ...item })),
      cartItems: cloneItems(record.cartItems)
    };
  });
}

export async function clearPendingCheckout(userId, token) {
  const normalizedUserId = Number(userId);
  if (!Number.isInteger(normalizedUserId) || normalizedUserId < 1) return;
  return withCartLock(() => {
    const state = readPendingState();
    const key = String(normalizedUserId);
    if (!state[key] || (token && state[key].token !== token)) return;
    delete state[key];
    writePendingState(state);
  });
}

export function cartQuantity(items = getCart()) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

export function cartTotal(items = getCart()) {
  return items.reduce((total, item) => total + (item.price * item.quantity), 0);
}

export function subscribeCart(listener) {
  const localListener = (event) => {
    const items = Array.isArray(event.detail) ? normalizeItems(event.detail) : getCart();
    listener(cloneItems(items), { source: "local" });
  };
  const storageListener = (event) => {
    if (event.key !== CART_KEY || (event.storageArea && event.storageArea !== localStorage)) return;
    let state = parseStoredState(event.newValue);
    try {
      state = parseStoredState(localStorage.getItem(CART_KEY));
    } catch {
      // event.newValue vẫn là snapshot nguyên tử hợp lệ khi storage không đọc lại được.
    }
    memoryCart = state.items;
    memoryToken = state.token;
    memoryAppliedCheckouts = state.appliedCheckouts;
    storageUnavailable = false;
    cartRevision += 1;
    listener(cloneItems(memoryCart), { source: "storage" });
  };
  window.addEventListener(CART_EVENT, localListener);
  window.addEventListener("storage", storageListener);
  return () => {
    window.removeEventListener(CART_EVENT, localListener);
    window.removeEventListener("storage", storageListener);
  };
}
