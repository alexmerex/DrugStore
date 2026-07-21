import { categoryApi, orderApi, productApi } from "./api.js";
import { stateCard, statusBadge } from "./components.js";
import { categoryId, clear, createImage, debounce, el, formatCurrency, formatDate, productId, qs, qsa, setButtonBusy, statusLabel } from "./utils.js";
import { confirmAction, initShell, onAuthChange, openAuthDialog, showToast } from "./shell.js";

const guard = qs("#seller-guard");
const app = qs("#seller-app");
const productDialog = qs("#product-editor-dialog");
const productForm = qs("#product-editor-form");
const productTableWrap = qs("#products-table-wrap");
const productTableBody = qs("#products-table-body");
const productStateMount = qs("#products-management-state");
const categoryStateMount = qs("#categories-management-state");
const categoryGrid = qs("#category-manager-grid");
const orderStateMount = qs("#orders-management-state");
const orderList = qs("#order-list");

const data = {
  products: [],
  categories: [],
  orders: [],
  productSearch: "",
  orderFilter: "all",
  editingCategoryId: 0,
  loadStatus: { products: "idle", categories: "idle", orders: "idle" }
};
let loadedForUser = 0;

function categoryRecordId(category) {
  return Number(category?.id_Category ?? category?.iD_Category ?? category?.ID_Category ?? 0);
}

function loadingCard(message) {
  return stateCard({ title: "Đang tải dữ liệu", message, compact: true });
}

function renderGuard(session) {
  clear(guard);
  guard.hidden = false;
  app.hidden = true;
  const canAccess = session.authenticated && ["staff", "admin"].includes(session.user?.role);
  if (!canAccess && productDialog.open) productDialog.close();
  if (!session.authenticated) {
    const login = el("button", { className: "button button--primary", type: "button", text: "Đăng nhập nhân viên" });
    login.addEventListener("click", () => openAuthDialog("login"));
    guard.append(el("section", { className: "guard-card" },
      el("div", { className: "guard-card__content" }, [
        el("div", { className: "guard-card__mark", aria: { hidden: "true" }, text: "＋" }),
        el("h1", { text: "Không gian dành cho nhân viên" }),
        el("p", { text: "Bạn cần đăng nhập bằng tài khoản nhân viên hoặc quản trị viên để tiếp tục." }),
        login
      ])));
    return;
  }

  if (!(["staff", "admin"].includes(session.user?.role))) {
    guard.append(el("section", { className: "guard-card" },
      el("div", { className: "guard-card__content" }, [
        el("div", { className: "guard-card__mark", aria: { hidden: "true" }, text: "!" }),
        el("h1", { text: "Bạn không có quyền truy cập" }),
        el("p", { text: "Khu vực này chỉ dành cho nhân viên vận hành và quản trị viên." }),
        el("a", { className: "button button--secondary", href: "/", text: "Quay lại cửa hàng" })
      ])));
    return;
  }

  guard.hidden = true;
  app.hidden = false;
  if (loadedForUser !== Number(session.user.userID)) {
    loadedForUser = Number(session.user.userID);
    loadDashboard();
  }
}

function statCard(label, value, hint, icon) {
  return el("article", { className: "stat-card" }, [
    el("div", { className: "stat-card__top" }, [
      el("span", { className: "stat-card__label", text: label }),
      el("span", { className: "stat-card__icon", aria: { hidden: "true" }, text: icon })
    ]),
    el("strong", { text: value }),
    el("small", { text: hint })
  ]);
}

function renderStats() {
  const newOrders = data.orders.filter((order) => order.status === "new").length;
  const processing = data.orders.filter((order) => order.status === "processing").length;
  qs("#seller-stats").replaceChildren(
    statCard("Sản phẩm", data.products.length, "Đang hiển thị trong cửa hàng", "SP"),
    statCard("Danh mục", data.categories.length, "Nhóm sản phẩm đang quản lý", "DM"),
    statCard("Đơn mới", newOrders, "Cần được xác nhận xử lý", "M"),
    statCard("Đang xử lý", processing, "Đơn hàng chưa hoàn tất", "XL")
  );
}

function categoryName(id) {
  return data.categories.find((category) => categoryRecordId(category) === Number(id))?.name || "Chưa phân loại";
}

function tableProduct(product) {
  return el("div", { className: "table-product" }, [
    el("div", { className: "table-product__image" }, createImage(product.image_URL ?? product.imageURL, product.name)),
    el("div", {}, [
      el("strong", { text: product.name }),
      el("small", { text: product.type || `Mã #${productId(product)}` })
    ])
  ]);
}

function renderProducts() {
  if (data.loadStatus.products !== "ready") return;
  clear(productTableBody);
  clear(productStateMount);
  const needle = data.productSearch.toLocaleLowerCase("vi");
  const products = data.products.filter((product) => !needle
    || String(product.name).toLocaleLowerCase("vi").includes(needle)
    || String(product.type || "").toLocaleLowerCase("vi").includes(needle)
    || String(product.ingredient || "").toLocaleLowerCase("vi").includes(needle));
  qs("#product-count-label").textContent = `${products.length} / ${data.products.length} sản phẩm`;

  if (!products.length) {
    productTableWrap.hidden = true;
    productStateMount.append(stateCard({
      title: data.products.length ? "Không có kết quả phù hợp" : "Chưa có sản phẩm",
      message: data.products.length ? "Hãy thử một từ khóa khác." : "Tạo sản phẩm đầu tiên để bắt đầu bán hàng.",
      compact: true
    }));
    renderStats();
    return;
  }

  products.forEach((product) => {
    const edit = el("button", { className: "table-action", type: "button", text: "Sửa", aria: { label: `Sửa ${product.name}` } });
    const remove = el("button", { className: "table-action table-action--danger", type: "button", text: "Xóa", aria: { label: `Xóa ${product.name}` } });
    edit.addEventListener("click", () => openProductEditor(product));
    remove.addEventListener("click", () => deleteProduct(product));
    productTableBody.append(el("tr", {}, [
      el("td", {}, tableProduct(product)),
      el("td", { text: categoryName(categoryId(product)) }),
      el("td", { text: formatCurrency(product.price) }),
      el("td", { text: product.unit || "—" }),
      el("td", {}, el("div", { className: "table-actions" }, [edit, remove]))
    ]));
  });
  productTableWrap.hidden = false;
  renderStats();
}

function populateCategorySelect(selected = 0) {
  const select = qs("#product-category");
  clear(select);
  select.append(el("option", { value: "", text: "Chọn danh mục", disabled: true, selected: !selected }));
  data.categories.forEach((category) => select.append(el("option", {
    value: categoryRecordId(category),
    selected: categoryRecordId(category) === Number(selected),
    text: category.name
  })));
}

function renderCategories() {
  if (data.loadStatus.categories !== "ready") return;
  clear(categoryStateMount);
  clear(categoryGrid);
  populateCategorySelect();
  if (!data.categories.length) {
    categoryStateMount.append(stateCard({
      title: "Chưa có danh mục",
      message: "Thêm danh mục đầu tiên để có thể tạo sản phẩm.",
      compact: true
    }));
    renderStats();
    return;
  }

  data.categories.forEach((category) => {
    const id = categoryRecordId(category);
    const count = Number(category.productCount ?? data.products.filter((product) => categoryId(product) === id).length);
    const edit = el("button", {
      className: "button button--secondary button--small",
      type: "button",
      text: "Đổi tên",
      aria: { label: `Đổi tên danh mục ${category.name}` }
    });
    const remove = el("button", {
      className: "button button--danger button--small",
      type: "button",
      text: "Xóa",
      disabled: count > 0,
      aria: { label: `Xóa danh mục ${category.name}` },
      title: count > 0 ? "Không thể xóa danh mục đang chứa sản phẩm" : "Xóa danh mục"
    });
    edit.addEventListener("click", () => startCategoryEdit(category));
    remove.addEventListener("click", () => deleteCategory(category));
    categoryGrid.append(el("article", { className: "category-manager-card" }, [
      el("div", {}, [el("strong", { text: category.name }), el("small", { text: `${count} sản phẩm` })]),
      el("div", { className: "table-actions" }, [edit, remove])
    ]));
  });
  renderStats();
}

function orderLine(item) {
  return el("div", { className: "order-line" }, [
    el("div", { className: "order-line__image" }, createImage(item.imageURL, item.productName)),
    el("p", {}, [item.productName, el("small", { text: `${item.quantity} × ${formatCurrency(item.unitPrice)}` })]),
    el("strong", { text: formatCurrency(item.lineTotal) })
  ]);
}

function orderSummary(order, items) {
  const quantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  const discount = Number(order.discount || 0);
  const tax = Number(order.tax || 0);
  const breakdown = [];
  if (discount > 0 || tax > 0) {
    breakdown.push(`Tạm tính ${formatCurrency(subtotal)}`);
    if (discount > 0) breakdown.push(`Giảm ${discount}%`);
    if (tax > 0) breakdown.push(`Thuế ${tax}%`);
  }
  return el("div", { className: "order-card__summary" }, [
    el("span", { text: `${quantity} sản phẩm` }),
    breakdown.length ? el("small", { text: breakdown.join(" · ") }) : null
  ]);
}

function renderOrders() {
  if (data.loadStatus.orders !== "ready") return;
  clear(orderStateMount);
  clear(orderList);
  const orders = data.orders.filter((order) => data.orderFilter === "all" || order.status === data.orderFilter);
  if (!orders.length) {
    orderStateMount.append(stateCard({
      title: data.orders.length ? "Không có đơn ở trạng thái này" : "Chưa có đơn hàng",
      message: data.orders.length ? "Chọn trạng thái khác để xem thêm đơn." : "Đơn mới từ khách hàng sẽ xuất hiện tại đây.",
      compact: true
    }));
    renderStats();
    return;
  }

  orders.forEach((order) => {
    const finalized = ["completed", "cancelled"].includes(order.status);
    const transitions = order.status === "new"
      ? ["new", "processing", "cancelled"]
      : order.status === "processing"
        ? ["processing", "completed", "cancelled"]
        : [order.status];
    const select = el("select", { aria: { label: `Trạng thái đơn hàng ${order.orderID}` }, disabled: finalized });
    transitions.forEach((status) => select.append(el("option", { value: status, selected: status === order.status, text: statusLabel(status) })));
    const save = el("button", { className: "button button--secondary button--small", type: "button", text: "Cập nhật", disabled: finalized });
    save.addEventListener("click", async () => {
      if (select.value === order.status) {
        showToast("Trạng thái đơn hàng chưa thay đổi.");
        return;
      }
      setButtonBusy(save, true, "Đang lưu…");
      try {
        await orderApi.updateStatus(order.orderID, select.value);
        showToast(`Đã cập nhật đơn #${order.orderID} sang “${statusLabel(select.value)}”.`);
        await loadOrders();
      } catch (error) {
        showToast(error.message, "error");
        setButtonBusy(save, false);
      }
    });

    const items = Array.isArray(order.items) ? order.items : [];
    orderList.append(el("article", { className: "order-card" }, [
      el("header", { className: "order-card__header" }, [
        el("div", {}, [
          el("div", { className: "order-card__id" }, [el("strong", { text: `Đơn #${order.orderID}` }), statusBadge(order.status), el("small", { text: formatDate(order.date, true) })]),
          el("p", { className: "order-card__buyer" }, ["Khách hàng: ", el("strong", { text: order.buyerName || `#${order.buyerID}` })])
        ]),
        el("div", { className: "order-card__controls" }, [select, save])
      ]),
      el("div", { className: "order-card__items" }, items.length ? items.map(orderLine) : el("p", { className: "order-card__buyer", text: "Không có chi tiết sản phẩm." })),
      el("div", { className: "order-card__total" }, [orderSummary(order, items), el("strong", { text: formatCurrency(order.total) })])
    ]));
  });
  renderStats();
}

async function loadProducts() {
  data.loadStatus.products = "loading";
  productTableWrap.hidden = true;
  productStateMount.replaceChildren(loadingCard("Đang lấy danh sách sản phẩm…"));
  try {
    data.products = await productApi.list({ limit: 200 });
    data.loadStatus.products = "ready";
    renderProducts();
    renderCategories();
  } catch (error) {
    data.products = [];
    data.loadStatus.products = "error";
    productStateMount.replaceChildren(stateCard({
      title: "Không thể tải sản phẩm", message: error.message, type: "error", compact: true,
      actionLabel: "Thử lại", onAction: loadProducts
    }));
    renderStats();
  }
}

async function loadCategories() {
  data.loadStatus.categories = "loading";
  categoryStateMount.replaceChildren(loadingCard("Đang lấy danh mục sản phẩm…"));
  clear(categoryGrid);
  try {
    data.categories = await categoryApi.list();
    data.loadStatus.categories = "ready";
    renderCategories();
    renderProducts();
  } catch (error) {
    data.categories = [];
    data.loadStatus.categories = "error";
    categoryStateMount.replaceChildren(stateCard({
      title: "Không thể tải danh mục", message: error.message, type: "error", compact: true,
      actionLabel: "Thử lại", onAction: loadCategories
    }));
    renderStats();
  }
}

async function loadOrders() {
  data.loadStatus.orders = "loading";
  orderStateMount.replaceChildren(loadingCard("Đang lấy các đơn hàng gần đây…"));
  clear(orderList);
  try {
    data.orders = await orderApi.list();
    data.loadStatus.orders = "ready";
    renderOrders();
  } catch (error) {
    data.orders = [];
    data.loadStatus.orders = "error";
    orderStateMount.replaceChildren(stateCard({
      title: "Không thể tải đơn hàng", message: error.message, type: "error", compact: true,
      actionLabel: "Thử lại", onAction: loadOrders
    }));
    renderStats();
  }
}

async function loadDashboard() {
  productTableWrap.hidden = true;
  productStateMount.replaceChildren(loadingCard("Đang lấy danh sách sản phẩm…"));
  categoryStateMount.replaceChildren(loadingCard("Đang lấy danh mục sản phẩm…"));
  orderStateMount.replaceChildren(loadingCard("Đang lấy các đơn hàng gần đây…"));
  await Promise.allSettled([loadCategories(), loadProducts(), loadOrders()]);
}

function productPayload() {
  return {
    idProduct: Number(qs("#product-id").value) || 0,
    name: qs("#product-name").value.trim(),
    id_Category: Number(qs("#product-category").value),
    price: Number(qs("#product-price").value),
    unit: qs("#product-unit").value.trim(),
    type: qs("#product-type").value.trim(),
    dosageForms: qs("#product-dosage-forms").value.trim(),
    packing: qs("#product-packing").value.trim(),
    brandOrigin: qs("#product-brand-origin").value.trim(),
    producer: qs("#product-producer").value.trim(),
    manufacturingCountry: qs("#product-country").value.trim(),
    ingredient: qs("#product-ingredient").value.trim(),
    shortDescription: qs("#product-description").value.trim(),
    registrationNumber: qs("#product-registration").value.trim(),
    image_URL: qs("#product-image").value.trim()
  };
}

function openProductEditor(product = null) {
  if (!data.categories.length) {
    showToast("Hãy tạo ít nhất một danh mục trước khi thêm sản phẩm.", "error");
    activatePanel("categories-panel");
    return;
  }
  productForm.reset();
  const editing = Boolean(product);
  qs("#product-editor-title").textContent = editing ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm";
  qs("#save-product-button").textContent = editing ? "Lưu thay đổi" : "Tạo sản phẩm";
  qs("#product-id").value = editing ? productId(product) : "";
  populateCategorySelect(editing ? categoryId(product) : 0);
  if (editing) {
    qs("#product-name").value = product.name || "";
    qs("#product-price").value = Number(product.price) || 0;
    qs("#product-unit").value = product.unit || "";
    qs("#product-type").value = product.type || "";
    qs("#product-dosage-forms").value = product.dosageForms || "";
    qs("#product-packing").value = product.packing || "";
    qs("#product-brand-origin").value = product.brandOrigin || "";
    qs("#product-producer").value = product.producer || "";
    qs("#product-country").value = product.manufacturingCountry || "";
    qs("#product-ingredient").value = product.ingredient || "";
    qs("#product-description").value = product.shortDescription || "";
    qs("#product-registration").value = product.registrationNumber || "";
    qs("#product-image").value = product.image_URL ?? product.imageURL ?? "";
  }
  productDialog.showModal();
  window.setTimeout(() => qs("#product-name").focus(), 0);
}

async function deleteProduct(product) {
  const accepted = await confirmAction({
    title: "Xóa sản phẩm?",
    message: `“${product.name}” sẽ bị xóa khỏi cửa hàng. Thao tác này không thể hoàn tác.`,
    confirmLabel: "Xóa sản phẩm"
  });
  if (!accepted) return;
  try {
    await productApi.remove(productId(product));
    showToast("Đã xóa sản phẩm.");
    await Promise.all([loadProducts(), loadCategories()]);
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function deleteCategory(category) {
  const accepted = await confirmAction({
    title: "Xóa danh mục?",
    message: `Danh mục “${category.name}” sẽ bị xóa.`,
    confirmLabel: "Xóa danh mục"
  });
  if (!accepted) return;
  try {
    await categoryApi.remove(categoryRecordId(category));
    if (data.editingCategoryId === categoryRecordId(category)) resetCategoryEditor();
    showToast("Đã xóa danh mục.");
    await loadCategories();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function startCategoryEdit(category) {
  data.editingCategoryId = categoryRecordId(category);
  const input = qs("#new-category-name");
  input.value = category.name;
  qs("#save-category-button").textContent = "Lưu tên";
  qs("#cancel-category-edit").hidden = false;
  input.focus();
  input.select();
}

function resetCategoryEditor() {
  data.editingCategoryId = 0;
  const form = qs("#category-form");
  form.reset();
  qs("#save-category-button").textContent = "Thêm danh mục";
  qs("#cancel-category-edit").hidden = true;
}

function activatePanel(panelId) {
  qsa(".dashboard-tabs [role='tab']").forEach((tab) => {
    const selected = tab.dataset.panel === panelId;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  qsa(".dashboard-panel").forEach((panel) => { panel.hidden = panel.id !== panelId; });
}

qsa(".dashboard-tabs [role='tab']").forEach((tab, index, tabs) => {
  tab.addEventListener("click", () => activatePanel(tab.dataset.panel));
  tab.addEventListener("keydown", (event) => {
    if (!(["ArrowLeft", "ArrowRight"].includes(event.key))) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    activatePanel(next.dataset.panel);
    next.focus();
  });
});
activatePanel("products-panel");

qs("#add-product-button").addEventListener("click", () => openProductEditor());
qs("#manager-product-search").addEventListener("input", debounce((event) => {
  data.productSearch = event.target.value.trim();
  renderProducts();
}, 180));
qs("#order-status-filter").addEventListener("change", (event) => {
  data.orderFilter = event.target.value;
  renderOrders();
});
qs("#cancel-category-edit").addEventListener("click", resetCategoryEditor);

qs("#category-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = qs("#new-category-name");
  const button = qs("button[type='submit']", event.currentTarget);
  if (!event.currentTarget.reportValidity()) return;
  const editingId = data.editingCategoryId;
  const name = input.value.trim();
  let saved = false;
  setButtonBusy(button, true, editingId ? "Đang lưu…" : "Đang thêm…");
  try {
    if (editingId) await categoryApi.update(editingId, name);
    else await categoryApi.create(name);
    saved = true;
    showToast(editingId ? "Đã đổi tên danh mục." : "Đã thêm danh mục mới.");
    await loadCategories();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setButtonBusy(button, false);
    if (saved) resetCategoryEditor();
  }
});

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!productForm.reportValidity()) return;
  const product = productPayload();
  const id = Number(qs("#product-id").value);
  const button = qs("#save-product-button");
  setButtonBusy(button, true, "Đang lưu…");
  try {
    if (id) await productApi.update(id, product);
    else await productApi.create(product);
    productDialog.close();
    showToast(id ? "Đã cập nhật sản phẩm." : "Đã tạo sản phẩm mới.");
    await Promise.all([loadProducts(), loadCategories()]);
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setButtonBusy(button, false);
  }
});

const initialSession = await initShell("seller");
renderGuard(initialSession);
onAuthChange((session) => {
  if (!session.authenticated) loadedForUser = 0;
  renderGuard(session);
});
