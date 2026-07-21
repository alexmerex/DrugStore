import { userApi } from "./api.js";
import { roleBadge, stateCard } from "./components.js";
import { clear, debounce, el, qs, setButtonBusy } from "./utils.js";
import { confirmAction, initShell, onAuthChange, openAuthDialog, showToast } from "./shell.js";

const guard = qs("#admin-guard");
const app = qs("#admin-app");
const tableWrap = qs("#users-table-wrap");
const tableBody = qs("#users-table-body");
const stateMount = qs("#users-management-state");
const dialog = qs("#user-editor-dialog");
const form = qs("#user-editor-form");

const state = {
  users: [],
  search: "",
  role: "all",
  currentUserId: 0
};
let loadedForUser = 0;

function userId(user) {
  return Number(user?.userID ?? user?.UserID ?? 0);
}

function renderGuard(session) {
  clear(guard);
  guard.hidden = false;
  app.hidden = true;
  const canAccess = session.authenticated && session.user?.role === "admin";
  if (!canAccess && dialog.open) dialog.close();
  state.currentUserId = Number(session.user?.userID) || 0;
  if (!session.authenticated) {
    const login = el("button", { className: "button button--primary", type: "button", text: "Đăng nhập quản trị" });
    login.addEventListener("click", () => openAuthDialog("login"));
    guard.append(el("section", { className: "guard-card" },
      el("div", { className: "guard-card__content" }, [
        el("div", { className: "guard-card__mark", aria: { hidden: "true" }, text: "＋" }),
        el("h1", { text: "Khu vực quản trị hệ thống" }),
        el("p", { text: "Đăng nhập bằng tài khoản quản trị viên để quản lý người dùng và phân quyền." }),
        login
      ])));
    return;
  }

  if (session.user?.role !== "admin") {
    guard.append(el("section", { className: "guard-card" },
      el("div", { className: "guard-card__content" }, [
        el("div", { className: "guard-card__mark", aria: { hidden: "true" }, text: "!" }),
        el("h1", { text: "Chỉ quản trị viên được truy cập" }),
        el("p", { text: "Tài khoản hiện tại không có quyền quản lý người dùng hệ thống." }),
        el("a", { className: "button button--secondary", href: session.user?.role === "staff" ? "/seller.html" : "/", text: "Quay lại" })
      ])));
    return;
  }

  guard.hidden = true;
  app.hidden = false;
  if (loadedForUser !== state.currentUserId) {
    loadedForUser = state.currentUserId;
    loadUsers();
  }
}

function statCard(label, count, hint, icon) {
  return el("article", { className: "stat-card" }, [
    el("div", { className: "stat-card__top" }, [
      el("span", { className: "stat-card__label", text: label }),
      el("span", { className: "stat-card__icon", aria: { hidden: "true" }, text: icon })
    ]),
    el("strong", { text: count }),
    el("small", { text: hint })
  ]);
}

function renderStats() {
  qs("#admin-stats").replaceChildren(
    statCard("Tất cả tài khoản", state.users.length, "Tổng người dùng hệ thống", "∑"),
    statCard("Khách hàng", state.users.filter((user) => user.role === "buyer").length, "Tài khoản có thể đặt hàng", "KH"),
    statCard("Nhân viên", state.users.filter((user) => user.role === "staff").length, "Tài khoản vận hành", "NV"),
    statCard("Quản trị viên", state.users.filter((user) => user.role === "admin").length, "Tài khoản toàn quyền", "QT")
  );
}

function filteredUsers() {
  const needle = state.search.toLocaleLowerCase("vi");
  return state.users.filter((user) => {
    const matchesSearch = !needle || String(user.username).toLocaleLowerCase("vi").includes(needle) || String(userId(user)).includes(needle);
    const matchesRole = state.role === "all" || user.role === state.role;
    return matchesSearch && matchesRole;
  });
}

function renderUsers() {
  clear(tableBody);
  clear(stateMount);
  const users = filteredUsers();
  qs("#user-count-label").textContent = `${users.length} / ${state.users.length} tài khoản`;
  renderStats();

  if (!users.length) {
    tableWrap.hidden = true;
    stateMount.append(stateCard({
      title: state.users.length ? "Không tìm thấy tài khoản" : "Chưa có tài khoản",
      message: state.users.length ? "Thử đổi từ khóa hoặc bộ lọc vai trò." : "Tạo tài khoản đầu tiên để bắt đầu.",
      compact: true
    }));
    return;
  }

  users.forEach((user) => {
    const id = userId(user);
    const isCurrent = id === state.currentUserId;
    const edit = el("button", { className: "table-action", type: "button", text: "Sửa", aria: { label: `Sửa tài khoản ${user.username}` } });
    const remove = el("button", {
      className: "table-action table-action--danger",
      type: "button",
      text: "Xóa",
      disabled: isCurrent,
      title: isCurrent ? "Không thể xóa tài khoản đang đăng nhập" : "Xóa tài khoản",
      aria: { label: `Xóa tài khoản ${user.username}` }
    });
    edit.addEventListener("click", () => openEditor(user));
    remove.addEventListener("click", () => deleteUser(user));
    tableBody.append(el("tr", {}, [
      el("td", { text: `#${String(id).padStart(3, "0")}` }),
      el("td", {}, [el("strong", { text: user.username }), isCurrent ? el("small", { text: " (Bạn)" }) : null]),
      el("td", {}, roleBadge(user.role)),
      el("td", {}, el("div", { className: "table-actions" }, [edit, remove]))
    ]));
  });
  tableWrap.hidden = false;
}

async function loadUsers() {
  tableWrap.hidden = true;
  stateMount.replaceChildren(stateCard({ title: "Đang tải dữ liệu", message: "Đang lấy danh sách tài khoản…", compact: true }));
  try {
    state.users = await userApi.list();
    renderUsers();
  } catch (error) {
    state.users = [];
    renderStats();
    stateMount.replaceChildren(stateCard({
      title: "Không thể tải tài khoản",
      message: error.message,
      type: "error",
      compact: true,
      actionLabel: "Thử lại",
      onAction: loadUsers
    }));
  }
}

function openEditor(user = null) {
  form.reset();
  const editing = Boolean(user);
  const current = editing && userId(user) === state.currentUserId;
  qs("#user-editor-title").textContent = editing ? "Chỉnh sửa tài khoản" : "Thêm tài khoản";
  qs("#save-user-button").textContent = editing ? "Lưu thay đổi" : "Tạo tài khoản";
  qs("#user-id").value = editing ? userId(user) : "";
  dialog.dataset.originalUsername = editing ? user.username : "";
  qs("#editor-username").value = editing ? user.username : "";
  qs("#editor-role").value = editing ? user.role : "buyer";
  qs("#editor-role").disabled = current;
  const password = qs("#editor-password");
  password.required = !editing;
  password.value = "";
  qs("#password-label").textContent = editing ? "Mật khẩu mới" : "Mật khẩu *";
  qs("#password-help").textContent = editing ? "Để trống nếu không muốn đổi mật khẩu." : "Tối thiểu 8 ký tự.";
  dialog.showModal();
  window.setTimeout(() => qs("#editor-username").focus(), 0);
}

async function deleteUser(user) {
  const accepted = await confirmAction({
    title: "Xóa tài khoản?",
    message: `Tài khoản “${user.username}” sẽ bị xóa vĩnh viễn nếu chưa phát sinh đơn hàng.`,
    confirmLabel: "Xóa tài khoản"
  });
  if (!accepted) return;
  try {
    await userApi.remove(userId(user));
    showToast("Đã xóa tài khoản.");
    await loadUsers();
  } catch (error) {
    showToast(error.message, "error");
  }
}

qs("#add-user-button").addEventListener("click", () => openEditor());
qs("#user-search").addEventListener("input", debounce((event) => {
  state.search = event.target.value.trim();
  renderUsers();
}, 180));
qs("#user-role-filter").addEventListener("change", (event) => {
  state.role = event.target.value;
  renderUsers();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const id = Number(qs("#user-id").value);
  const password = qs("#editor-password").value;
  const payload = {
    username: qs("#editor-username").value.trim(),
    role: qs("#editor-role").value,
    password: id ? (password || null) : password
  };
  const invalidatesCurrentSession = id === state.currentUserId
    && (payload.username !== dialog.dataset.originalUsername || Boolean(password));
  const button = qs("#save-user-button");
  setButtonBusy(button, true, "Đang lưu…");
  try {
    if (id) await userApi.update(id, payload);
    else await userApi.create(payload);
    dialog.close();
    if (invalidatesCurrentSession) {
      showToast("Tài khoản của bạn đã thay đổi. Vui lòng đăng nhập lại.");
      window.setTimeout(() => window.location.reload(), 1300);
      return;
    }
    showToast(id ? "Đã cập nhật tài khoản." : "Đã tạo tài khoản mới.");
    await loadUsers();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setButtonBusy(button, false);
  }
});

const initialSession = await initShell("admin");
renderGuard(initialSession);
onAuthChange((session) => {
  if (!session.authenticated || session.user?.role !== "admin") loadedForUser = 0;
  renderGuard(session);
});
