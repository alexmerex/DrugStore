import { addToCart } from "./cart.js";
import { categoryId, createImage, el, formatCurrency, productId } from "./utils.js";

export function productCard(product, categoryName = "Sản phẩm chăm sóc sức khỏe") {
  const id = productId(product);
  const link = `/product.html?id=${encodeURIComponent(id)}`;
  const imageLink = el("a", {
    className: "product-card__image-link",
    href: link,
    aria: { label: `Xem ${product.name}` }
  }, [
    createImage(product.image_URL ?? product.imageURL, product.name, "product-card__image"),
    el("span", { className: "product-card__category", text: categoryName })
  ]);

  const addButton = el("button", {
    className: "product-card__add",
    type: "button",
    aria: { label: `Thêm ${product.name} vào giỏ hàng` },
    text: "Thêm vào giỏ"
  });
  addButton.addEventListener("click", async () => {
    addButton.disabled = true;
    try {
      await addToCart(product, 1);
      window.dispatchEvent(new CustomEvent("mocan:toast", {
        detail: { message: "Đã thêm sản phẩm vào giỏ hàng.", type: "success" }
      }));
    } catch {
      window.dispatchEvent(new CustomEvent("mocan:toast", {
        detail: { message: "Chưa thể cập nhật giỏ hàng. Vui lòng thử lại.", type: "error" }
      }));
    } finally {
      addButton.disabled = false;
    }
  });

  return el("article", { className: "product-card", dataset: { productId: id, categoryId: categoryId(product) } }, [
    imageLink,
    el("div", { className: "product-card__body" }, [
      el("p", { className: "product-card__type", text: product.type || categoryName }),
      el("h3", {}, el("a", { href: link, text: product.name })),
      el("div", { className: "product-card__footer" }, [
        el("div", { className: "product-card__price" }, [formatCurrency(product.price), el("small", { text: `/ ${product.unit || "sản phẩm"}` })]),
        addButton
      ])
    ])
  ]);
}

export function skeletonCards(count = 8) {
  return Array.from({ length: count }, () => el("div", { className: "skeleton-card", aria: { hidden: "true" } }, [
    el("div", { className: "skeleton-card__image" }),
    el("div", { className: "skeleton-card__body" }, [
      el("div", { className: "skeleton-line skeleton-line--short" }),
      el("div", { className: "skeleton-line skeleton-line--title" }),
      el("div", { className: "skeleton-line skeleton-line--medium" }),
      el("div", { className: "skeleton-line skeleton-line--short" })
    ])
  ]));
}

export function stateCard({ title, message, actionLabel = "", onAction, type = "empty", compact = false }) {
  const card = el("div", {
    className: `state-card state-card--${type}${compact ? " state-card--compact" : ""}`,
    role: type === "error" ? "alert" : "status",
    aria: { atomic: "true" }
  });
  const content = el("div", { className: "state-card__content" }, [
    el("div", { className: "state-card__icon", aria: { hidden: "true" }, text: type === "error" ? "!" : "＋" }),
    el(compact ? "h3" : "h2", { text: title }),
    el("p", { text: message })
  ]);
  if (actionLabel && onAction) {
    const action = el("button", { className: "button button--secondary", type: "button", text: actionLabel });
    action.addEventListener("click", onAction);
    content.append(action);
  }
  card.append(content);
  return card;
}

export function roleBadge(role) {
  const labels = { buyer: "Khách hàng", staff: "Nhân viên", admin: "Quản trị viên" };
  return el("span", { className: `role-badge role-badge--${role}`, text: labels[role] || role });
}

export function statusBadge(status) {
  const labels = { new: "Mới", processing: "Đang xử lý", completed: "Hoàn tất", cancelled: "Đã hủy" };
  return el("span", { className: `status-badge status-badge--${status}`, text: labels[status] || status });
}
