import { categoryApi, productApi } from "./api.js";
import { productCard, skeletonCards, stateCard } from "./components.js";
import { categoryId, clear, el, qs } from "./utils.js";
import { initShell } from "./shell.js";

const grid = qs("#product-grid");
const stateMount = qs("#catalog-state");
const filters = qs("#category-filters");
const resultsMeta = qs("#results-meta");
const sortSelect = qs("#sort-products");
const heroForm = qs("#hero-search-form");
const heroInput = qs("#hero-search-input");
let productRequestSequence = 0;

const params = new URLSearchParams(window.location.search);
const state = {
  categories: [],
  products: [],
  search: (params.get("q") || "").trim(),
  category: Number(params.get("category")) || 0,
  sort: "featured"
};

heroInput.value = state.search;

function categoryRecordId(category) {
  return Number(category?.id_Category ?? category?.iD_Category ?? category?.ID_Category ?? 0);
}

function categoryMap() {
  return new Map(state.categories.map((category) => [categoryRecordId(category), category.name]));
}

function syncUrl() {
  const url = new URL(window.location.href);
  if (state.search) url.searchParams.set("q", state.search);
  else url.searchParams.delete("q");
  if (state.category) url.searchParams.set("category", String(state.category));
  else url.searchParams.delete("category");
  url.hash = "products";
  history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function renderFilters() {
  clear(filters);
  const choices = [{ id: 0, name: "Tất cả", productCount: state.categories.reduce((sum, category) => sum + Number(category.productCount || 0), 0) },
    ...state.categories.map((category) => ({ id: categoryRecordId(category), name: category.name, productCount: category.productCount }))];
  choices.forEach((choice) => {
    const button = el("button", {
      className: "category-chip",
      type: "button",
      aria: { pressed: String(state.category === choice.id) }
    }, [choice.name, choice.productCount !== undefined ? el("small", { text: choice.productCount }) : null]);
    button.addEventListener("click", () => {
      if (state.category === choice.id) return;
      state.category = choice.id;
      renderFilters();
      syncUrl();
      loadProducts();
    });
    filters.append(button);
  });
}

function sortedProducts() {
  const products = [...state.products];
  if (state.sort === "price-asc") products.sort((a, b) => Number(a.price) - Number(b.price));
  if (state.sort === "price-desc") products.sort((a, b) => Number(b.price) - Number(a.price));
  if (state.sort === "name") products.sort((a, b) => String(a.name).localeCompare(String(b.name), "vi"));
  return products;
}

function renderProducts() {
  clear(grid);
  clear(stateMount);
  const products = sortedProducts();
  grid.setAttribute("aria-busy", "false");

  const context = [];
  if (state.search) context.push(`cho “${state.search}”`);
  const activeCategory = state.categories.find((category) => categoryRecordId(category) === state.category);
  if (activeCategory) context.push(`trong ${activeCategory.name}`);
  resultsMeta.textContent = `${products.length} sản phẩm${context.length ? ` ${context.join(" ")}` : ""}`;

  if (!products.length) {
    grid.hidden = true;
    stateMount.append(stateCard({
      title: "Chưa tìm thấy sản phẩm phù hợp",
      message: "Hãy thử từ khóa ngắn hơn hoặc chọn lại danh mục để xem thêm sản phẩm.",
      actionLabel: "Xóa bộ lọc",
      onAction: () => {
        state.search = "";
        state.category = 0;
        heroInput.value = "";
        renderFilters();
        syncUrl();
        loadProducts();
      }
    }));
    return;
  }

  grid.hidden = false;
  const names = categoryMap();
  products.forEach((product) => grid.append(productCard(product, names.get(categoryId(product)) || "Chăm sóc sức khỏe")));
}

async function loadProducts() {
  const requestSequence = ++productRequestSequence;
  clear(stateMount);
  grid.hidden = false;
  grid.setAttribute("aria-busy", "true");
  grid.replaceChildren(...skeletonCards(8));
  resultsMeta.textContent = "Đang tìm sản phẩm…";
  try {
    const products = await productApi.list({ search: state.search, categoryId: state.category || "", limit: 200 });
    if (requestSequence !== productRequestSequence) return;
    state.products = products;
    renderProducts();
  } catch (error) {
    if (requestSequence !== productRequestSequence) return;
    clear(grid);
    grid.hidden = true;
    grid.setAttribute("aria-busy", "false");
    resultsMeta.textContent = "";
    stateMount.replaceChildren(stateCard({
      title: "Không thể tải danh sách sản phẩm",
      message: error.message,
      type: "error",
      actionLabel: "Thử lại",
      onAction: loadProducts
    }));
  }
}

async function loadCategories() {
  try {
    state.categories = await categoryApi.list();
    if (state.category && !state.categories.some((category) => categoryRecordId(category) === state.category)) {
      state.category = 0;
    }
  } catch {
    state.categories = [];
    state.category = 0;
  }
  renderFilters();
}

heroForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.search = heroInput.value.trim();
  syncUrl();
  loadProducts();
  qs("#products")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

sortSelect.addEventListener("change", () => {
  state.sort = sortSelect.value;
  renderProducts();
});

await initShell("home");
await loadCategories();
await loadProducts();

if (window.location.hash === "#products" || state.search || state.category) {
  window.setTimeout(() => qs("#products")?.scrollIntoView({ block: "start" }), 0);
}
