export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

export function clear(node) {
  node?.replaceChildren();
  return node;
}

export function el(tagName, attributes = {}, children = []) {
  const node = document.createElement(tagName);

  Object.entries(attributes).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return;

    if (key === "className") {
      node.className = value;
    } else if (key === "text") {
      node.textContent = String(value);
    } else if (key === "dataset") {
      Object.entries(value).forEach(([dataKey, dataValue]) => {
        node.dataset[dataKey] = String(dataValue);
      });
    } else if (key === "aria") {
      Object.entries(value).forEach(([ariaKey, ariaValue]) => {
        node.setAttribute(`aria-${ariaKey}`, String(ariaValue));
      });
    } else if (key === "hidden") {
      node.hidden = Boolean(value);
    } else if (key in node && key !== "role") {
      try {
        node[key] = value;
      } catch {
        node.setAttribute(key, String(value));
      }
    } else {
      node.setAttribute(key, value === true ? "" : String(value));
    }
  });

  append(node, children);
  return node;
}

export function append(parent, children) {
  const items = Array.isArray(children) ? children : [children];
  items.flat(Infinity).forEach((child) => {
    if (child === undefined || child === null || child === false) return;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return parent;
}

export function productId(product) {
  return Number(product?.idProduct ?? product?.IDProduct ?? 0);
}

export function categoryId(product) {
  return Number(product?.id_Category ?? product?.iD_Category ?? product?.ID_Category ?? 0);
}

export function imageUrl(item) {
  return String(item?.image_URL ?? item?.imageURL ?? item?.Image_URL ?? "").trim();
}

export function safeImageUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value), window.location.origin);
    const sameOrigin = url.origin === window.location.origin;
    return url.protocol === "https:" || (sameOrigin && url.protocol === "http:") ? url.href : "";
  } catch {
    return "";
  }
}

export function imageFallback(label = "Không có ảnh") {
  return el("div", { className: "image-fallback", role: "img", aria: { label } }, [
    el("span", { className: "image-fallback__mark", aria: { hidden: "true" } })
  ]);
}

export function createImage(source, alt, className = "") {
  const validSource = safeImageUrl(source);
  if (!validSource) return imageFallback(`Chưa có ảnh cho ${alt}`);

  const image = el("img", {
    className,
    src: validSource,
    alt,
    loading: "lazy",
    decoding: "async",
    referrerPolicy: "no-referrer"
  });
  image.addEventListener("error", () => {
    image.replaceWith(imageFallback(`Không tải được ảnh cho ${alt}`));
  }, { once: true });
  return image;
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

export function formatDate(value, includeTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Không xác định";
  return new Intl.DateTimeFormat("vi-VN", includeTime
    ? { dateStyle: "short", timeStyle: "short" }
    : { dateStyle: "medium" }).format(date);
}

export function debounce(callback, wait = 250) {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), wait);
  };
}

export function setButtonBusy(button, busy, busyLabel = "Đang xử lý…") {
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  } else {
    button.textContent = button.dataset.originalLabel || button.textContent;
    button.disabled = false;
    button.removeAttribute("aria-busy");
    delete button.dataset.originalLabel;
  }
}

export function roleLabel(role) {
  return ({ buyer: "Khách hàng", staff: "Nhân viên", admin: "Quản trị viên" })[role] || "Không xác định";
}

export function statusLabel(status) {
  return ({
    new: "Mới",
    processing: "Đang xử lý",
    completed: "Hoàn tất",
    cancelled: "Đã hủy"
  })[status] || status || "Không xác định";
}
