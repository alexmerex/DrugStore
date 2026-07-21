export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function validationMessage(payload) {
  if (!payload?.errors || typeof payload.errors !== "object") return "";
  return Object.values(payload.errors)
    .flatMap((messages) => Array.isArray(messages) ? messages : [messages])
    .filter(Boolean)
    .join(" ");
}

function fallbackMessage(status) {
  if (status === 400) return "Thông tin gửi lên chưa hợp lệ.";
  if (status === 401) return "Bạn cần đăng nhập để tiếp tục.";
  if (status === 403) return "Tài khoản của bạn không có quyền thực hiện thao tác này.";
  if (status === 404) return "Không tìm thấy dữ liệu yêu cầu.";
  if (status === 409) return "Dữ liệu đã thay đổi hoặc đang được sử dụng.";
  if (status === 429) return "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.";
  if (status >= 500) return "Máy chủ đang gặp sự cố. Vui lòng thử lại sau.";
  return "Không thể hoàn tất yêu cầu. Vui lòng thử lại.";
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");

  let body = options.body;
  if (body !== undefined && body !== null && !(body instanceof FormData) && typeof body !== "string") {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(path, {
      ...options,
      body,
      headers,
      credentials: "same-origin"
    });
  } catch (error) {
    throw new ApiError("Không thể kết nối đến máy chủ. Hãy kiểm tra kết nối và thử lại.", 0, error);
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  let payload = null;
  try {
    payload = contentType.includes("json") ? await response.json() : await response.text();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 401 && !String(path).startsWith("/api/auth/login")) {
      window.dispatchEvent(new CustomEvent("mocan:session-invalid"));
    }
    const message = validationMessage(payload)
      || (typeof payload === "object" ? payload?.title || payload?.detail : "")
      || fallbackMessage(response.status);
    throw new ApiError(message, response.status, payload);
  }

  return payload;
}

export const authApi = {
  session: () => api("/api/auth/session"),
  login: (username, password, signal) => api("/api/auth/login", { method: "POST", body: { username, password }, signal }),
  register: (username, password, signal) => api("/api/auth/register", { method: "POST", body: { username, password }, signal }),
  logout: () => api("/api/auth/logout", { method: "POST" })
};

export const productApi = {
  list: ({ search = "", categoryId = "", limit = 100 } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (search) params.set("search", search);
    if (categoryId) params.set("categoryId", String(categoryId));
    return api(`/api/products?${params}`);
  },
  get: (id) => api(`/api/products/${encodeURIComponent(id)}`),
  create: (product) => api("/api/products", { method: "POST", body: product }),
  update: (id, product) => api(`/api/products/${encodeURIComponent(id)}`, { method: "PUT", body: product }),
  remove: (id) => api(`/api/products/${encodeURIComponent(id)}`, { method: "DELETE" })
};

export const categoryApi = {
  list: () => api("/api/categories"),
  create: (name) => api("/api/categories", { method: "POST", body: { name } }),
  update: (id, name) => api(`/api/categories/${encodeURIComponent(id)}`, { method: "PUT", body: { name } }),
  remove: (id) => api(`/api/categories/${encodeURIComponent(id)}`, { method: "DELETE" })
};

export const orderApi = {
  list: () => api("/api/orders"),
  mine: () => api("/api/orders/mine"),
  create: (items, idempotencyKey) => api("/api/orders", { method: "POST", body: { items, idempotencyKey } }),
  updateStatus: (id, status) => api(`/api/orders/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status } })
};

export const userApi = {
  list: () => api("/api/users"),
  create: (user) => api("/api/users", { method: "POST", body: user }),
  update: (id, user) => api(`/api/users/${encodeURIComponent(id)}`, { method: "PUT", body: user }),
  remove: (id) => api(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" })
};
