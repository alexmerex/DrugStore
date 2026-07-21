import { authApi, orderApi, productApi } from "./api.js";
import { cartQuantity, cartTotal, changeCartItem, clearPendingCheckout, getCart, getCartSnapshot, getPendingCheckout, reconcileCartWithCatalog, removeCartItem, removePurchasedItems, savePendingCheckout, subscribeCart, updateCartItem } from "./cart.js";
import { stateCard, statusBadge } from "./components.js";
import { clear, createImage, el, formatCurrency, formatDate, qs, qsa, roleLabel, setButtonBusy } from "./utils.js";

let currentSession = { authenticated: false, user: null };
let activePage = "";
let initialized = false;
let authDialog;
let cartDialog;
let myOrdersDialog;
let confirmDialog;
let accountRoot;
let navRoot;
let cartCount;
let toastRegion;
let confirmResolver = null;
let cartCatalogSync = null;
let checkoutInProgress = false;
let cartMutationInProgress = false;
let cartFocusMemory = null;
let sessionRevision = 0;
let sessionRequestSequence = 0;
let authRequestRevision = 0;
let authAbortController = null;
let myOrdersLoadSequence = 0;

function brand() {
  return el("a", { className: "brand", href: "/", aria: { label: "Mộc An Pharmacy – trang chủ" } }, [
    el("span", { className: "brand-mark", aria: { hidden: "true" } }),
    el("span", { className: "brand-copy" }, [
      el("strong", { text: "Mộc An" }),
      el("small", { text: "Pharmacy" })
    ])
  ]);
}

function renderHeader() {
  const mount = qs("#site-header");
  if (!mount) return;

  const announcement = el("div", { className: "announcement-bar" },
    el("div", { className: "announcement-bar__inner section-shell" }, [
      el("span", { aria: { hidden: "true" } }),
      "Chăm sóc sức khỏe chủ động · Thông tin sản phẩm minh bạch"
    ]));

  const searchForm = el("form", { className: "header-search", role: "search" }, [
    el("label", { className: "sr-only", htmlFor: "header-search-input", text: "Tìm kiếm sản phẩm" }),
    el("span", { className: "search-mark", aria: { hidden: "true" } }),
    el("input", { id: "header-search-input", name: "search", type: "search", placeholder: "Tìm thuốc, vitamin, sản phẩm…", autocomplete: "off" })
  ]);
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = qs("input", searchForm).value.trim();
    const url = new URL("/", window.location.origin);
    if (value) url.searchParams.set("q", value);
    url.hash = "products";
    window.location.assign(`${url.pathname}${url.search}${url.hash}`);
  });

  accountRoot = el("div", { id: "header-account" });
  const cartButton = el("button", {
    className: "header-action",
    id: "cart-button",
    type: "button",
    aria: { label: "Mở giỏ hàng" }
  }, [
    el("span", { className: "header-action__icon", aria: { hidden: "true" }, text: "◒" }),
    el("span", { className: "header-action__label", text: "Giỏ hàng" })
  ]);
  cartCount = el("span", { className: "cart-count", hidden: true, aria: { label: "0 sản phẩm" } });
  cartButton.append(cartCount);
  cartButton.addEventListener("click", openCartDialog);

  const actions = el("div", { className: "header-actions" }, [accountRoot, cartButton]);
  navRoot = el("nav", { className: "site-nav", aria: { label: "Điều hướng chính" } },
    el("div", { className: "site-nav__inner section-shell" }));

  const header = el("header", { className: "site-header" }, [
    el("div", { className: "site-header__main section-shell" }, [brand(), searchForm, actions]),
    navRoot
  ]);
  mount.replaceChildren(announcement, header);
  renderNavigation();
  renderAccount();
  updateCartCount(getCart());
}

function renderNavigation() {
  const inner = qs(".site-nav__inner", navRoot);
  if (!inner) return;
  const links = [
    { href: "/", label: "Trang chủ", page: "home" },
    { href: "/#products", label: "Sản phẩm", page: "products" },
    { href: "/#care", label: "Chăm sóc sức khỏe", page: "care" }
  ];
  const role = currentSession.user?.role;
  if (role === "staff" || role === "admin") links.push({ href: "/seller.html", label: "Vận hành", page: "seller" });
  if (role === "admin") links.push({ href: "/admin.html", label: "Quản trị", page: "admin" });
  inner.replaceChildren(...links.map((link) => el("a", {
    href: link.href,
    text: link.label,
    aria: link.page === activePage ? { current: "page" } : undefined
  })));
}

function renderAccount() {
  if (!accountRoot) return;
  clear(accountRoot);

  if (!currentSession.authenticated || !currentSession.user) {
    const loginButton = el("button", {
      className: "header-action",
      type: "button",
      aria: { label: "Đăng nhập hoặc đăng ký" }
    }, [
      el("span", { className: "header-action__icon", aria: { hidden: "true" }, text: "○" }),
      el("span", { className: "header-action__label", text: "Đăng nhập" })
    ]);
    loginButton.addEventListener("click", () => openAuthDialog("login"));
    accountRoot.append(loginButton);
    renderNavigation();
    return;
  }

  const user = currentSession.user;
  const summary = el("summary", { className: "header-action", aria: { label: `Tài khoản ${user.username}` } }, [
    el("span", { className: "header-action__icon", aria: { hidden: "true" }, text: "●" }),
    el("span", { className: "header-action__label", text: user.username })
  ]);
  const popover = el("div", { className: "account-menu__popover" }, [
    el("div", { className: "account-menu__identity" }, [
      el("strong", { text: user.username }),
      el("small", { text: roleLabel(user.role) })
    ]),
    el("a", { href: "/", text: "Trang mua sắm" })
  ]);
  if (user.role === "staff" || user.role === "admin") {
    popover.append(el("a", { href: "/seller.html", text: "Vận hành cửa hàng" }));
  }
  if (user.role === "admin") {
    popover.append(el("a", { href: "/admin.html", text: "Quản trị tài khoản" }));
  }
  if (user.role === "buyer") {
    const myOrdersButton = el("button", { type: "button", text: "Đơn hàng của tôi" });
    myOrdersButton.addEventListener("click", () => {
      qs("details.account-menu")?.removeAttribute("open");
      openMyOrdersDialog();
    });
    popover.append(myOrdersButton);
  }
  const logoutButton = el("button", { type: "button", text: "Đăng xuất" });
  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    try {
      await authApi.logout();
      setSession({ authenticated: false });
      showToast("Bạn đã đăng xuất.");
    } catch (error) {
      showToast(error.message, "error");
      logoutButton.disabled = false;
    }
  });
  popover.append(logoutButton);
  accountRoot.append(el("details", { className: "account-menu" }, [summary, popover]));
  renderNavigation();
}

function renderFooter() {
  const mount = qs("#site-footer");
  if (!mount) return;
  const year = new Date().getFullYear();
  const accountControl = currentSession.authenticated && currentSession.user
    ? el("span", { text: `${currentSession.user.username} · ${roleLabel(currentSession.user.role)}` })
    : el("button", { className: "footer-login-link", type: "button", text: "Đăng nhập / đăng ký" });
  mount.replaceChildren(el("footer", { className: "site-footer" }, [
    el("div", { className: "site-footer__top section-shell" }, [
      el("div", { className: "footer-brand" }, [
        brand(),
        el("p", { text: "Mộc An mang đến trải nghiệm tìm hiểu và lựa chọn sản phẩm chăm sóc sức khỏe rõ ràng, dễ dàng, đáng tin cậy." })
      ]),
      el("div", { className: "footer-columns" }, [
        el("div", { className: "footer-column" }, [
          el("h2", { text: "Khám phá" }),
          el("a", { href: "/#products", text: "Tất cả sản phẩm" }),
          el("a", { href: "/?category=1#products", text: "Sản phẩm nổi bật" })
        ]),
        el("div", { className: "footer-column" }, [
          el("h2", { text: "Tài khoản" }),
          accountControl,
          el("a", { href: "/seller.html", text: "Dành cho nhân viên" })
        ]),
        el("div", { className: "footer-column" }, [
          el("h2", { text: "Cam kết" }),
          el("span", { text: "Thông tin minh bạch" }),
          el("span", { text: "Bảo mật tài khoản" })
        ])
      ])
    ]),
    el("div", { className: "site-footer__bottom section-shell" }, [
      el("span", { text: `© ${year} Mộc An Pharmacy.` }),
      el("span", { text: "Sản phẩm không phải là thuốc và không có tác dụng thay thế thuốc chữa bệnh." })
    ])
  ]));
  qs(".footer-login-link", mount)?.addEventListener("click", () => openAuthDialog("login"));
}

function passwordField(id, label, autocomplete, minLength = 8) {
  const input = el("input", { id, type: "password", minlength: minLength, maxlength: 128, required: true, autocomplete });
  const toggle = el("button", { className: "password-toggle", type: "button", text: "Hiện", aria: { controls: id, pressed: "false" } });
  toggle.addEventListener("click", () => {
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    toggle.textContent = visible ? "Hiện" : "Ẩn";
    toggle.setAttribute("aria-pressed", String(!visible));
  });
  return el("label", { className: "field" }, [
    el("span", { text: label }),
    el("span", { className: "field__password" }, [input, toggle])
  ]);
}

function resetPasswordVisibility(form) {
  qsa(".field__password", form).forEach((wrapper) => {
    const input = qs("input", wrapper);
    const toggle = qs(".password-toggle", wrapper);
    if (input) input.type = "password";
    if (toggle) {
      toggle.textContent = "Hiện";
      toggle.setAttribute("aria-pressed", "false");
    }
  });
}

function buildAuthDialog() {
  const loginTab = el("button", { type: "button", role: "tab", id: "auth-login-tab", tabIndex: 0, aria: { selected: "true", controls: "auth-login-panel" }, text: "Đăng nhập" });
  const registerTab = el("button", { type: "button", role: "tab", id: "auth-register-tab", tabIndex: -1, aria: { selected: "false", controls: "auth-register-panel" }, text: "Đăng ký" });

  const loginForm = el("form", { className: "form-stack", id: "auth-login-panel", role: "tabpanel", aria: { labelledby: "auth-login-tab" } }, [
    el("label", { className: "field" }, [
      el("span", { text: "Tên đăng nhập" }),
      el("input", { id: "login-username", minlength: 3, maxlength: 60, required: true, autocomplete: "username", placeholder: "Nhập tên đăng nhập" })
    ]),
    passwordField("login-password", "Mật khẩu", "current-password", 1),
    el("p", { className: "form-message", id: "login-message", role: "alert" }),
    el("button", { className: "button button--primary button--full", type: "submit", text: "Đăng nhập" })
  ]);

  const registerForm = el("form", { className: "form-stack", id: "auth-register-panel", role: "tabpanel", aria: { labelledby: "auth-register-tab" }, hidden: true }, [
    el("label", { className: "field" }, [
      el("span", { text: "Tên đăng nhập" }),
      el("input", { id: "register-username", minlength: 3, maxlength: 60, required: true, autocomplete: "username", placeholder: "Từ 3 đến 60 ký tự" })
    ]),
    passwordField("register-password", "Mật khẩu", "new-password"),
    passwordField("register-confirm", "Nhập lại mật khẩu", "new-password"),
    el("p", { className: "form-message", id: "register-message", role: "alert" }),
    el("button", { className: "button button--primary button--full", type: "submit", text: "Tạo tài khoản" })
  ]);

  authDialog = el("dialog", { className: "modal", id: "auth-dialog", aria: { labelledby: "auth-title" } },
    el("div", { className: "modal__surface" }, [
      el("div", { className: "modal__header" }, [
        el("div", {}, [el("p", { className: "eyebrow", text: "Tài khoản Mộc An" }), el("h2", { id: "auth-title", text: "Chào mừng bạn" })]),
        el("button", { className: "icon-button", type: "button", dataset: { closeDialog: "" }, aria: { label: "Đóng" }, text: "×" })
      ]),
      el("p", { className: "auth-intro", text: "Đăng nhập để đặt hàng và sử dụng các tính năng dành cho tài khoản của bạn." }),
      el("div", { className: "auth-tabs", role: "tablist", aria: { label: "Chọn đăng nhập hoặc đăng ký" } }, [loginTab, registerTab]),
      loginForm,
      registerForm
    ]));

  const selectTab = (mode, focusField = true) => {
    const isLogin = mode === "login";
    loginTab.setAttribute("aria-selected", String(isLogin));
    registerTab.setAttribute("aria-selected", String(!isLogin));
    loginTab.tabIndex = isLogin ? 0 : -1;
    registerTab.tabIndex = isLogin ? -1 : 0;
    loginForm.hidden = !isLogin;
    registerForm.hidden = isLogin;
    qs("#auth-title", authDialog).textContent = isLogin ? "Chào mừng trở lại" : "Tạo tài khoản mới";
    if (focusField) {
      window.setTimeout(() => qs(isLogin ? "#login-username" : "#register-username", authDialog)?.focus(), 0);
    }
  };
  loginTab.addEventListener("click", () => selectTab("login"));
  registerTab.addEventListener("click", () => selectTab("register"));
  [loginTab, registerTab].forEach((tab) => {
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const useLogin = event.key === "Home"
        || (event.key !== "End" && tab === registerTab);
      const nextMode = useLogin ? "login" : "register";
      selectTab(nextMode, false);
      (useLogin ? loginTab : registerTab).focus();
    });
  });
  authDialog.selectTab = selectTab;

  const beginAuthRequest = (button, busyLabel) => {
    authAbortController?.abort();
    qsa("button[aria-busy='true']", authDialog).forEach((busyButton) => setButtonBusy(busyButton, false));
    const requestId = ++authRequestRevision;
    const controller = new AbortController();
    authAbortController = controller;
    setButtonBusy(button, true, busyLabel);
    return { requestId, controller };
  };

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = qs("#login-message", loginForm);
    const button = qs("button[type='submit']", loginForm);
    message.textContent = "";
    const { requestId, controller } = beginAuthRequest(button, "Đang đăng nhập…");
    try {
      const response = await authApi.login(
        qs("#login-username", loginForm).value.trim(),
        qs("#login-password", loginForm).value,
        controller.signal
      );
      if (requestId !== authRequestRevision || !authDialog.open) return;
      setSession({ authenticated: true, user: response.user });
      authAbortController = null;
      authDialog.close();
      showToast(`Xin chào ${response.user.username}.`);
    } catch (error) {
      if (requestId === authRequestRevision && authDialog.open) message.textContent = error.message;
    } finally {
      if (requestId === authRequestRevision) {
        authAbortController = null;
        setButtonBusy(button, false);
      }
    }
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = qs("#register-password", registerForm).value;
    const confirm = qs("#register-confirm", registerForm);
    const message = qs("#register-message", registerForm);
    confirm.setCustomValidity(password === confirm.value ? "" : "Mật khẩu nhập lại chưa khớp.");
    if (!registerForm.reportValidity()) return;
    const button = qs("button[type='submit']", registerForm);
    message.textContent = "";
    const { requestId, controller } = beginAuthRequest(button, "Đang tạo tài khoản…");
    try {
      const response = await authApi.register(
        qs("#register-username", registerForm).value.trim(),
        password,
        controller.signal
      );
      if (requestId !== authRequestRevision || !authDialog.open) return;
      setSession({ authenticated: true, user: response.user });
      authAbortController = null;
      authDialog.close();
      showToast("Tài khoản đã được tạo thành công.");
    } catch (error) {
      if (requestId === authRequestRevision && authDialog.open) message.textContent = error.message;
    } finally {
      if (requestId === authRequestRevision) {
        authAbortController = null;
        setButtonBusy(button, false);
      }
    }
  });

  const registerPassword = qs("#register-password", registerForm);
  const registerConfirm = qs("#register-confirm", registerForm);
  const validatePasswordConfirmation = () => {
    registerConfirm.setCustomValidity(
      !registerConfirm.value || registerPassword.value === registerConfirm.value
        ? ""
        : "Mật khẩu nhập lại chưa khớp."
    );
  };
  registerPassword.addEventListener("input", validatePasswordConfirmation);
  registerConfirm.addEventListener("input", validatePasswordConfirmation);
  authDialog.addEventListener("close", () => {
    authRequestRevision += 1;
    authAbortController?.abort();
    authAbortController = null;
    qsa("button[aria-busy='true']", authDialog).forEach((button) => setButtonBusy(button, false));
    loginForm.reset();
    registerForm.reset();
    registerConfirm.setCustomValidity("");
    qs("#login-message", loginForm).textContent = "";
    qs("#register-message", registerForm).textContent = "";
    resetPasswordVisibility(loginForm);
    resetPasswordVisibility(registerForm);
  });

  return authDialog;
}

function updateCartCount(items) {
  if (!cartCount) return;
  const quantity = cartQuantity(items);
  cartCount.hidden = quantity === 0;
  cartCount.textContent = quantity > 99 ? "99+" : String(quantity);
  cartCount.setAttribute("aria-label", `${quantity} sản phẩm trong giỏ`);
}

function quantityControl(item) {
  const locked = checkoutInProgress || cartMutationInProgress;
  const input = el("input", {
    type: "number",
    min: 1,
    max: 99,
    value: item.quantity,
    disabled: locked,
    dataset: { cartAction: "quantity", cartProduct: item.idProduct },
    aria: { label: `Số lượng ${item.name}` }
  });
  const minus = el("button", { type: "button", disabled: locked, dataset: { cartAction: "decrease", cartProduct: item.idProduct }, aria: { label: `Giảm số lượng ${item.name}` }, text: "−" });
  const plus = el("button", { type: "button", disabled: locked, dataset: { cartAction: "increase", cartProduct: item.idProduct }, aria: { label: `Tăng số lượng ${item.name}` }, text: "+" });
  const update = async (value, relative = false) => {
    if (checkoutInProgress || cartMutationInProgress) return;
    cartMutationInProgress = true;
    try {
      if (relative) await changeCartItem(item.idProduct, value);
      else await updateCartItem(item.idProduct, value);
    } catch {
      showToast("Chưa thể cập nhật giỏ hàng. Vui lòng thử lại.", "error");
    } finally {
      cartMutationInProgress = false;
      renderCart();
    }
  };
  minus.addEventListener("click", () => update(-1, true));
  plus.addEventListener("click", () => update(1, true));
  input.addEventListener("change", () => update(input.value));
  return el("div", { className: "quantity-control" }, [minus, input, plus]);
}

async function refreshCartCatalog(snapshot = getCartSnapshot()) {
  const initialItems = snapshot.items;
  const expectedToken = snapshot.token;
  if (!initialItems.length) return { changed: 0, removed: 0, items: [], cartChanged: false };
  if (!cartCatalogSync || cartCatalogSync.token !== expectedToken) {
    const entry = { token: expectedToken, promise: null };
    entry.promise = (async () => {
      const products = await productApi.list({ limit: 200 });
      if (!Array.isArray(products)) throw new Error("Dữ liệu sản phẩm trả về không hợp lệ.");
      if (getCartSnapshot().token !== expectedToken) {
        return { changed: 0, removed: 0, items: getCart(), cartChanged: true };
      }
      const listedIds = new Set(products.map((product) => Number(product?.idProduct ?? product?.IDProduct)));
      const missingIds = initialItems
        .map((item) => item.idProduct)
        .filter((id) => !listedIds.has(id));
      const remainingProducts = await Promise.all(missingIds.map(async (id) => {
        try {
          return await productApi.get(id);
        } catch (error) {
          if (error?.status === 404) return null;
          throw error;
        }
      }));
      if (getCartSnapshot().token !== expectedToken) {
        return { changed: 0, removed: 0, items: getCart(), cartChanged: true };
      }
      return reconcileCartWithCatalog(
        [...products, ...remainingProducts.filter(Boolean)],
        expectedToken
      );
    })();
    cartCatalogSync = entry;
  }
  const entry = cartCatalogSync;
  try {
    return await entry.promise;
  } finally {
    if (cartCatalogSync === entry) cartCatalogSync = null;
  }
}

function captureCartFocus(body) {
  const active = document.activeElement;
  if (active && body.contains(active)) {
    cartFocusMemory = {
      action: active.dataset?.cartAction || "",
      product: active.dataset?.cartProduct || ""
    };
  } else if (active && cartDialog?.contains(active) && active !== cartDialog) {
    cartFocusMemory = null;
  } else if (active && active !== document.body && active !== cartDialog) {
    cartFocusMemory = null;
  }
  return cartFocusMemory;
}

function restoreCartFocus(body, focus) {
  if (!focus || !cartDialog?.open) return;
  const exact = focus.action
    ? qs(`[data-cart-action="${focus.action}"]${focus.product ? `[data-cart-product="${focus.product}"]` : ""}`, body)
    : null;
  const target = exact
    || qs("[data-cart-action]", body)
    || qs("a, button, input", body)
    || qs("[data-close-dialog]", cartDialog);
  if (target && !target.disabled) target.focus();
}

function isDefinitiveOrderError(error) {
  const status = Number(error?.status);
  return status === 400 || status === 409;
}

function validateOrderResponse(order) {
  if (!order || !Number.isInteger(Number(order.orderID)) || Number(order.orderID) < 1) {
    throw new Error("Máy chủ đã phản hồi checkout nhưng thiếu thông tin đơn hàng. Hãy thử lại để xác nhận đơn.");
  }
  return order;
}

async function submitPendingOrder(userId, pending) {
  const order = validateOrderResponse(await orderApi.create(pending.orderItems, pending.token));
  await removePurchasedItems(pending.cartItems, pending.token, userId);
  await clearPendingCheckout(userId, pending.token);
  return order;
}

async function recoverPendingOrder(userId) {
  const pending = getPendingCheckout(userId);
  if (!pending) return null;
  try {
    return await submitPendingOrder(userId, pending);
  } catch (error) {
    if (isDefinitiveOrderError(error)) await clearPendingCheckout(userId, pending.token);
    throw error;
  }
}

function renderCart() {
  if (!cartDialog) return;
  const body = qs("#cart-body", cartDialog);
  if (!body) return;
  const focus = captureCartFocus(body);
  const items = getCart();
  updateCartCount(items);
  clear(body);

  if (!items.length) {
    body.append(el("div", { className: "state-card state-card--compact" },
      el("div", { className: "state-card__content" }, [
        el("div", { className: "state-card__icon", aria: { hidden: "true" }, text: "＋" }),
        el("h3", { text: "Giỏ hàng đang trống" }),
        el("p", { text: "Khám phá sản phẩm và thêm lựa chọn phù hợp vào đây." }),
        el("a", { className: "button button--secondary", href: "/#products", text: "Xem sản phẩm" })
      ])));
    restoreCartFocus(body, focus);
    return;
  }

  const list = el("div", { className: "cart-list" });
  items.forEach((item) => {
    const removeButton = el("button", { className: "cart-item__remove", type: "button", disabled: checkoutInProgress || cartMutationInProgress, dataset: { cartAction: "remove", cartProduct: item.idProduct }, aria: { label: `Xóa ${item.name} khỏi giỏ` }, text: "×" });
    removeButton.addEventListener("click", async () => {
      if (checkoutInProgress || cartMutationInProgress) return;
      cartMutationInProgress = true;
      try {
        await removeCartItem(item.idProduct);
      } catch {
        showToast("Chưa thể cập nhật giỏ hàng. Vui lòng thử lại.", "error");
      } finally {
        cartMutationInProgress = false;
        renderCart();
      }
    });
    list.append(el("article", { className: "cart-item" }, [
      el("div", { className: "cart-item__image" }, createImage(item.imageURL, item.name)),
      el("div", {}, [
        el("h3", { text: item.name }),
        el("p", { className: "cart-item__price", text: formatCurrency(item.price) }),
        el("div", { className: "cart-item__controls" }, quantityControl(item))
      ]),
      removeButton
    ]));
  });

  const checkout = el("button", {
    className: "button button--primary button--full",
    type: "button",
    text: checkoutInProgress ? "Đang tạo đơn…" : "Đặt hàng",
    disabled: checkoutInProgress || cartMutationInProgress,
    dataset: { cartAction: "checkout" },
    aria: checkoutInProgress ? { busy: "true" } : undefined
  });
  checkout.addEventListener("click", async () => {
    if (checkoutInProgress || cartMutationInProgress) return;
    if (!currentSession.authenticated) {
      cartDialog.close();
      openAuthDialog("login");
      showToast("Vui lòng đăng nhập bằng tài khoản khách hàng để đặt hàng.");
      return;
    }
    if (currentSession.user?.role !== "buyer") {
      showToast("Chỉ tài khoản khách hàng mới có thể đặt hàng.", "error");
      return;
    }
    const buyerId = Number(currentSession.user.userID) || 0;
    checkoutInProgress = true;
    const closeButton = qs("[data-close-dialog]", cartDialog);
    if (closeButton) closeButton.disabled = true;
    qsa("#cart-body button, #cart-body input", cartDialog).forEach((control) => { control.disabled = true; });
    setButtonBusy(checkout, true, "Đang tạo đơn…");
    cartFocusMemory = { action: "checkout", product: "" };
    let attempt = null;
    try {
      const recoveredOrder = await recoverPendingOrder(buyerId);
      if (recoveredOrder) {
        cartDialog.close();
        showToast(`Đơn #${recoveredOrder.orderID} đã được xác nhận, tổng ${formatCurrency(recoveredOrder.total)}.`);
        return;
      }

      const checkoutSnapshot = getCartSnapshot();
      const synchronized = await refreshCartCatalog(checkoutSnapshot);
      if (synchronized.changed || synchronized.removed) {
        showToast("Giỏ hàng vừa được cập nhật theo thông tin và giá hiện tại. Vui lòng kiểm tra rồi đặt hàng lại.", "error");
        return;
      }
      if (synchronized.cartChanged || getCartSnapshot().token !== checkoutSnapshot.token) {
        showToast("Giỏ hàng vừa thay đổi ở một thao tác khác. Vui lòng kiểm tra rồi đặt hàng lại.", "error");
        return;
      }
      if (!synchronized.items.length) {
        showToast("Các sản phẩm trong giỏ không còn khả dụng.", "error");
        return;
      }
      const orderItems = synchronized.items.map((item) => ({
          productID: item.idProduct,
          quantity: item.quantity,
          expectedUnitPrice: item.price
        }));
      attempt = {
        token: checkoutSnapshot.token,
        orderItems,
        cartItems: synchronized.items
      };
      attempt = await savePendingCheckout(buyerId, attempt);
      const order = await submitPendingOrder(buyerId, attempt);
      cartDialog.close();
      showToast(`Đặt hàng thành công. Mã đơn #${order.orderID}, tổng ${formatCurrency(order.total)}.`);
    } catch (error) {
      if (attempt && isDefinitiveOrderError(error)) {
        await clearPendingCheckout(buyerId, attempt.token);
      }
      if (error?.status === 409 && error?.payload?.type === "/problems/price-changed") {
        try {
          await refreshCartCatalog();
        } catch {
          // Giữ thông báo xung đột gốc nếu bước tải lại catalog cũng thất bại.
        }
      }
      showToast(error.message, "error");
    } finally {
      checkoutInProgress = false;
      if (closeButton) closeButton.disabled = false;
      if (cartDialog?.open) renderCart();
    }
  });

  body.append(el("div", { className: "cart-layout" }, [
    list,
    el("aside", { className: "cart-summary" }, [
      el("div", { className: "cart-summary__row" }, [el("span", { text: "Số lượng" }), el("strong", { text: `${cartQuantity(items)} sản phẩm` })]),
      el("div", { className: "cart-summary__row cart-summary__row--total" }, [el("span", { text: "Tổng cộng" }), el("strong", { text: formatCurrency(cartTotal(items)) })]),
      checkout,
      el("p", { className: "cart-note", text: "Giá trong đơn được xác nhận lại từ hệ thống khi đặt hàng." })
    ])
  ]));
  restoreCartFocus(body, focus);
}

function buildCartDialog() {
  cartDialog = el("dialog", { className: "modal modal--wide", id: "cart-dialog", aria: { labelledby: "cart-title" } },
    el("div", { className: "modal__surface" }, [
      el("div", { className: "modal__header" }, [
        el("div", {}, [el("p", { className: "eyebrow", text: "Lựa chọn của bạn" }), el("h2", { id: "cart-title", text: "Giỏ hàng" })]),
        el("button", { className: "icon-button", type: "button", dataset: { closeDialog: "" }, aria: { label: "Đóng" }, text: "×" })
      ]),
      el("div", { id: "cart-body" })
    ]));
  cartDialog.addEventListener("cancel", (event) => {
    if (checkoutInProgress) event.preventDefault();
  });
  cartDialog.addEventListener("close", () => { cartFocusMemory = null; });
  return cartDialog;
}

function myOrderLine(item) {
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

async function loadMyOrders() {
  const requestedUserId = Number(currentSession.user?.userID) || 0;
  if (!myOrdersDialog || currentSession.user?.role !== "buyer" || !requestedUserId) return;
  const requestId = ++myOrdersLoadSequence;
  const isStale = () => requestId !== myOrdersLoadSequence
    || currentSession.user?.role !== "buyer"
    || Number(currentSession.user?.userID) !== requestedUserId
    || !myOrdersDialog.open;
  const body = qs("#my-orders-body", myOrdersDialog);
  body.replaceChildren(stateCard({ title: "Đang tải đơn hàng", message: "Đang lấy lịch sử mua sắm của bạn…", compact: true }));
  try {
    const orders = await orderApi.mine();
    if (isStale()) return;
    clear(body);
    if (!orders.length) {
      body.append(stateCard({
        title: "Bạn chưa có đơn hàng",
        message: "Những đơn đã đặt sẽ được lưu và hiển thị tại đây.",
        compact: true
      }));
      return;
    }

    const list = el("div", { className: "order-list" });
    orders.forEach((order) => {
      const controls = el("div", { className: "order-card__controls" });
      if (order.status === "new") {
        const cancel = el("button", { className: "button button--danger button--small", type: "button", text: "Hủy đơn" });
        cancel.addEventListener("click", async () => {
          const accepted = await confirmAction({
            title: "Hủy đơn hàng?",
            message: `Đơn #${order.orderID} sẽ được chuyển sang trạng thái đã hủy.`,
            confirmLabel: "Hủy đơn"
          });
          if (!accepted) return;
          setButtonBusy(cancel, true, "Đang hủy…");
          try {
            await orderApi.updateStatus(order.orderID, "cancelled");
            showToast(`Đã hủy đơn #${order.orderID}.`);
            await loadMyOrders();
          } catch (error) {
            showToast(error.message, "error");
            setButtonBusy(cancel, false);
          }
        });
        controls.append(cancel);
      }
      const items = Array.isArray(order.items) ? order.items : [];
      list.append(el("article", { className: "order-card" }, [
        el("header", { className: "order-card__header" }, [
          el("div", { className: "order-card__id" }, [
            el("strong", { text: `Đơn #${order.orderID}` }),
            statusBadge(order.status),
            el("small", { text: formatDate(order.date, true) })
          ]),
          controls
        ]),
        el("div", { className: "order-card__items" }, items.length ? items.map(myOrderLine) : el("p", { className: "order-card__buyer", text: "Không có chi tiết sản phẩm." })),
        el("div", { className: "order-card__total" }, [
          orderSummary(order, items),
          el("strong", { text: formatCurrency(order.total) })
        ])
      ]));
    });
    body.append(list);
  } catch (error) {
    if (isStale()) return;
    body.replaceChildren(stateCard({
      title: "Không thể tải đơn hàng",
      message: error.message,
      type: "error",
      compact: true,
      actionLabel: "Thử lại",
      onAction: loadMyOrders
    }));
  }
}

function buildMyOrdersDialog() {
  myOrdersDialog = el("dialog", { className: "modal modal--wide", id: "my-orders-dialog", aria: { labelledby: "my-orders-title" } },
    el("div", { className: "modal__surface" }, [
      el("div", { className: "modal__header" }, [
        el("div", {}, [el("p", { className: "eyebrow", text: "Lịch sử mua sắm" }), el("h2", { id: "my-orders-title", text: "Đơn hàng của tôi" })]),
        el("button", { className: "icon-button", type: "button", dataset: { closeDialog: "" }, aria: { label: "Đóng" }, text: "×" })
      ]),
      el("div", { id: "my-orders-body" })
    ]));
  myOrdersDialog.addEventListener("close", () => { myOrdersLoadSequence += 1; });
  return myOrdersDialog;
}

function buildConfirmDialog() {
  confirmDialog = el("dialog", { className: "modal", id: "confirm-dialog", aria: { labelledby: "confirm-title" } },
    el("div", { className: "modal__surface form-stack" }, [
      el("div", { className: "modal__header" }, [
        el("div", {}, [el("p", { className: "eyebrow", text: "Xác nhận thao tác" }), el("h2", { id: "confirm-title", text: "Bạn có chắc chắn?" })]),
        el("button", { className: "icon-button", type: "button", dataset: { closeDialog: "" }, aria: { label: "Đóng" }, text: "×" })
      ]),
      el("p", { className: "confirm-copy", id: "confirm-message" }),
      el("div", { className: "modal__actions" }, [
        el("button", { className: "button button--ghost", id: "confirm-cancel", type: "button", text: "Hủy" }),
        el("button", { className: "button button--danger", id: "confirm-accept", type: "button", text: "Xác nhận" })
      ])
    ]));
  qs("#confirm-cancel", confirmDialog).addEventListener("click", () => confirmDialog.close("cancel"));
  qs("#confirm-accept", confirmDialog).addEventListener("click", () => confirmDialog.close("confirm"));
  confirmDialog.addEventListener("close", () => {
    if (confirmResolver) {
      confirmResolver(confirmDialog.returnValue === "confirm");
      confirmResolver = null;
    }
  });
  return confirmDialog;
}

function buildOverlays() {
  toastRegion = el("div", { className: "toast-region", id: "toast-region", aria: { live: "polite", atomic: "false" } });
  document.body.append(buildAuthDialog(), buildCartDialog(), buildMyOrdersDialog(), buildConfirmDialog(), toastRegion);
}

function setSession(session, { fromRefresh = false } = {}) {
  const previousBuyerId = currentSession.user?.role === "buyer"
    ? Number(currentSession.user?.userID) || 0
    : 0;
  if (!fromRefresh) sessionRevision += 1;
  currentSession = {
    authenticated: Boolean(session?.authenticated && session?.user),
    user: session?.authenticated ? session.user : null
  };
  const nextBuyerId = currentSession.user?.role === "buyer"
    ? Number(currentSession.user?.userID) || 0
    : 0;
  if (previousBuyerId !== nextBuyerId) myOrdersLoadSequence += 1;
  if (myOrdersDialog?.open && !nextBuyerId) {
    myOrdersDialog.close();
  }
  renderAccount();
  renderFooter();
  window.dispatchEvent(new CustomEvent("mocan:auth-change", { detail: currentSession }));
}

export async function refreshSession() {
  const revision = sessionRevision;
  const requestId = ++sessionRequestSequence;
  try {
    const session = await authApi.session();
    if (requestId === sessionRequestSequence && revision === sessionRevision) {
      setSession(session, { fromRefresh: true });
    }
  } catch {
    if (requestId === sessionRequestSequence && revision === sessionRevision) {
      setSession({ authenticated: false }, { fromRefresh: true });
    }
  }
  return currentSession;
}

export async function initShell(page = "") {
  activePage = page;
  if (!initialized) {
    initialized = true;
    renderHeader();
    renderFooter();
    buildOverlays();
    subscribeCart((items, { source } = {}) => {
      updateCartCount(items);
      if (source === "storage" && cartDialog?.open) renderCart();
    });
    window.addEventListener("mocan:toast", (event) => showToast(event.detail?.message, event.detail?.type));
    window.addEventListener("mocan:session-invalid", () => {
      const wasAuthenticated = currentSession.authenticated;
      setSession({ authenticated: false });
      if (wasAuthenticated) showToast("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", "error");
    });
    document.addEventListener("click", (event) => {
      const closeButton = event.target.closest("[data-close-dialog]");
      if (closeButton) {
        const dialog = closeButton.closest("dialog");
        if (dialog !== cartDialog || !checkoutInProgress) dialog?.close();
      }
      qsa("details.account-menu[open]").forEach((details) => {
        if (!details.contains(event.target)) details.removeAttribute("open");
      });
    });
  } else {
    renderNavigation();
  }
  return refreshSession();
}

export function onAuthChange(listener) {
  const handler = (event) => listener(event.detail);
  window.addEventListener("mocan:auth-change", handler);
  return () => window.removeEventListener("mocan:auth-change", handler);
}

export function openAuthDialog(mode = "login") {
  if (!authDialog) return;
  if (!authDialog.open) {
    qsa(".form-message", authDialog).forEach((message) => { message.textContent = ""; });
    qsa(".field__password input", authDialog).forEach((input) => { input.value = ""; });
    resetPasswordVisibility(authDialog);
  }
  authDialog.selectTab(mode === "register" ? "register" : "login");
  if (!authDialog.open) authDialog.showModal();
}

export function openCartDialog() {
  if (!cartDialog) return;
  renderCart();
  if (!cartDialog.open) cartDialog.showModal();
  refreshCartCatalog()
    .then(({ changed, removed, cartChanged }) => {
      if (cartChanged) return;
      if (!changed && !removed) return;
      if (cartDialog.open) renderCart();
      const details = [
        changed ? `${changed} sản phẩm được cập nhật` : "",
        removed ? `${removed} sản phẩm không còn khả dụng đã được bỏ` : ""
      ].filter(Boolean).join("; ");
      showToast(`Giỏ hàng đã đồng bộ: ${details}.`);
    })
    .catch(() => showToast("Chưa thể cập nhật thông tin và giá sản phẩm trong giỏ.", "error"));
}

export function openMyOrdersDialog() {
  if (!myOrdersDialog || currentSession.user?.role !== "buyer") return;
  if (!myOrdersDialog.open) myOrdersDialog.showModal();
  loadMyOrders();
}

export function showToast(message, type = "success") {
  if (!message || !toastRegion) return;
  const toast = el("div", { className: `toast toast--${type}`, role: type === "error" ? "alert" : "status" }, [
    el("span", { className: "toast__icon", aria: { hidden: "true" }, text: type === "error" ? "!" : "✓" }),
    el("p", { text: message })
  ]);
  const closeButton = el("button", { type: "button", aria: { label: "Đóng thông báo" }, text: "×" });
  const remove = () => {
    if (!toast.isConnected) return;
    toast.classList.add("toast--leaving");
    window.setTimeout(() => toast.remove(), 220);
  };
  closeButton.addEventListener("click", remove);
  toast.append(closeButton);
  toastRegion.append(toast);
  window.setTimeout(remove, 4500);
}

export function confirmAction({ title = "Bạn có chắc chắn?", message, confirmLabel = "Xác nhận" }) {
  if (!confirmDialog) return Promise.resolve(false);
  if (confirmResolver) confirmResolver(false);
  qs("#confirm-title", confirmDialog).textContent = title;
  qs("#confirm-message", confirmDialog).textContent = message;
  qs("#confirm-accept", confirmDialog).textContent = confirmLabel;
  confirmDialog.returnValue = "cancel";
  confirmDialog.showModal();
  return new Promise((resolve) => { confirmResolver = resolve; });
}
