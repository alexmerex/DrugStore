import { categoryApi, productApi } from "./api.js";
import { addToCart } from "./cart.js";
import { productCard, stateCard } from "./components.js";
import { categoryId, clear, createImage, el, formatCurrency, productId, qs } from "./utils.js";
import { initShell, showToast } from "./shell.js";

const detailMount = qs("#product-detail");
const stateMount = qs("#product-detail-state");
const relatedSection = qs("#related-section");
const relatedGrid = qs("#related-grid");
const currentBreadcrumb = qs("#breadcrumb-current");
const id = Number(new URLSearchParams(window.location.search).get("id"));

function categoryRecordId(category) {
  return Number(category?.id_Category ?? category?.iD_Category ?? category?.ID_Category ?? 0);
}

function loadingDetail() {
  detailMount.setAttribute("aria-busy", "true");
  detailMount.replaceChildren(el("div", { className: "detail-skeleton", aria: { hidden: "true" } }, [
    el("div", { className: "detail-skeleton__image" }),
    el("div", { className: "detail-skeleton__copy" }, [
      el("div", { className: "skeleton-line skeleton-line--short" }),
      el("div", { className: "skeleton-line skeleton-line--hero" }),
      el("div", { className: "skeleton-line skeleton-line--medium" }),
      el("div", { className: "skeleton-line skeleton-line--short" }),
      el("div", { className: "skeleton-line skeleton-line--medium" })
    ])
  ]));
}

function fact(label, value) {
  if (!value) return null;
  return el("div", {}, [el("dt", { text: label }), el("dd", { text: value })]);
}

function quantityPicker(product) {
  let value = 1;
  const input = el("input", { type: "number", min: 1, max: 99, value: 1, aria: { label: `Số lượng ${product.name}` } });
  const minus = el("button", { type: "button", aria: { label: "Giảm số lượng" }, text: "−" });
  const plus = el("button", { type: "button", aria: { label: "Tăng số lượng" }, text: "+" });
  const setValue = (next) => {
    const numeric = Number(next);
    value = Number.isFinite(numeric)
      ? Math.min(99, Math.max(1, Math.trunc(numeric)))
      : 1;
    input.value = value;
  };
  minus.addEventListener("click", () => setValue(value - 1));
  plus.addEventListener("click", () => setValue(value + 1));
  input.addEventListener("change", () => setValue(input.value));
  return {
    node: el("div", { className: "quantity-control" }, [minus, input, plus]),
    getValue: () => value
  };
}

function renderDetail(product, categoryName) {
  document.title = `${product.name} | Mộc An Pharmacy`;
  currentBreadcrumb.textContent = product.name;
  detailMount.setAttribute("aria-busy", "false");

  const picker = quantityPicker(product);
  const addButton = el("button", { className: "button button--primary", type: "button", text: "Thêm vào giỏ hàng" });
  addButton.addEventListener("click", async () => {
    addButton.disabled = true;
    try {
      const quantity = picker.getValue();
      await addToCart(product, quantity);
      showToast(`Đã thêm ${quantity} sản phẩm vào giỏ hàng.`);
    } catch {
      showToast("Chưa thể cập nhật giỏ hàng. Vui lòng thử lại.", "error");
    } finally {
      addButton.disabled = false;
    }
  });

  const facts = [
    fact("Đơn vị tính", product.unit),
    fact("Dạng bào chế", product.dosageForms),
    fact("Quy cách", product.packing),
    fact("Thương hiệu", product.brandOrigin),
    fact("Nước sản xuất", product.manufacturingCountry),
    fact("Nhà sản xuất", product.producer)
  ].filter(Boolean);

  const gallery = el("div", { className: "product-gallery" }, [
    el("div", { className: "product-gallery__main" }, createImage(product.image_URL ?? product.imageURL, product.name)),
    el("span", { className: "product-gallery__badge", text: "Thông tin minh bạch" })
  ]);
  const info = el("section", { className: "product-info", aria: { labelledby: "product-title" } }, [
    el("span", { className: "product-info__category", text: categoryName }),
    el("h1", { id: "product-title", text: product.name }),
    el("p", { className: "product-info__code", text: product.registrationNumber ? `Số đăng ký: ${product.registrationNumber}` : `Mã sản phẩm: MA-${String(productId(product)).padStart(4, "0")}` }),
    el("div", { className: "product-info__price" }, [formatCurrency(product.price), el("small", { text: `/ ${product.unit || "sản phẩm"}` })]),
    product.shortDescription ? el("p", { className: "product-info__description", text: product.shortDescription }) : null,
    facts.length ? el("dl", { className: "product-facts" }, facts) : null,
    el("div", { className: "purchase-box" }, [
      el("div", { className: "purchase-box__quantity" }, [el("span", { text: "Số lượng" }), picker.node]),
      addButton
    ]),
    el("div", { className: "purchase-assurance", aria: { label: "Cam kết mua sắm" } }, [
      el("p", {}, [el("span", { aria: { hidden: "true" }, text: "✓" }), "Thông tin rõ ràng"]),
      el("p", {}, [el("span", { aria: { hidden: "true" }, text: "◎" }), "Giỏ hàng an toàn"]),
      el("p", {}, [el("span", { aria: { hidden: "true" }, text: "↺" }), "Đặt hàng nhanh"])
    ])
  ]);

  const content = [];
  if (product.ingredient) content.push(el("article", { className: "content-card" }, [el("h2", { text: "Thành phần" }), el("p", { text: product.ingredient })]));
  content.push(el("article", { className: "content-card" }, [
    el("h2", { text: "Thông tin sản phẩm" }),
    el("p", { text: [
      product.type ? `Nhóm sản phẩm: ${product.type}.` : "",
      product.producer ? `Sản xuất bởi ${product.producer}.` : "",
      product.shortDescription || "Vui lòng đọc kỹ thông tin sản phẩm trước khi sử dụng."
    ].filter(Boolean).join("\n\n") })
  ]));

  detailMount.replaceChildren(el("article", { className: "product-detail" }, [
    gallery,
    info,
    el("div", { className: "product-content" }, content)
  ]));
}

async function loadProduct() {
  clear(stateMount);
  loadingDetail();
  relatedSection.hidden = true;
  if (!Number.isInteger(id) || id < 1) {
    clear(detailMount);
    detailMount.setAttribute("aria-busy", "false");
    stateMount.append(stateCard({
      title: "Đường dẫn sản phẩm chưa hợp lệ",
      message: "Hãy quay lại danh sách và chọn sản phẩm bạn muốn xem.",
      type: "error",
      actionLabel: "Xem sản phẩm",
      onAction: () => window.location.assign("/#products")
    }));
    return;
  }

  try {
    const [product, categories] = await Promise.all([productApi.get(id), categoryApi.list().catch(() => [])]);
    const names = new Map(categories.map((category) => [categoryRecordId(category), category.name]));
    const name = names.get(categoryId(product)) || product.type || "Chăm sóc sức khỏe";
    renderDetail(product, name);

    try {
      const related = await productApi.list({ categoryId: categoryId(product), limit: 5 });
      const choices = related.filter((item) => productId(item) !== id).slice(0, 4);
      if (choices.length) {
        relatedGrid.replaceChildren(...choices.map((item) => productCard(item, name)));
        relatedSection.hidden = false;
      }
    } catch {
      relatedSection.hidden = true;
    }
  } catch (error) {
    clear(detailMount);
    detailMount.setAttribute("aria-busy", "false");
    stateMount.replaceChildren(stateCard({
      title: error.status === 404 ? "Không tìm thấy sản phẩm" : "Không thể tải sản phẩm",
      message: error.status === 404 ? "Sản phẩm có thể đã được gỡ hoặc đường dẫn không còn hợp lệ." : error.message,
      type: "error",
      actionLabel: error.status === 404 ? "Về danh sách" : "Thử lại",
      onAction: error.status === 404 ? () => window.location.assign("/#products") : loadProduct
    }));
  }
}

await initShell("products");
await loadProduct();
