# API smoke/integration test

`smoke.mjs` dùng duy nhất API có sẵn của Node.js. Theo mặc định, script tự khởi chạy
`BackendApp` trên một cổng loopback riêng và trỏ `DrugStore:DataFilePath` tới file JSON
tạm. Ở chế độ mặc định này, test không ghi vào `BackendApp/App_Data` và tự dọn
process/data sau khi chạy.

Yêu cầu: Node.js 18+ và .NET 8 SDK.

```powershell
node tests/static.mjs
node tests/smoke.mjs
```

`static.mjs` không cần .NET SDK. Script kiểm tra cú pháp/import JavaScript, Web Lock,
đường khóa `localStorage` dự phòng bằng hai instance module, token/pending/line cleanup của giỏ hàng, liên kết tài nguyên HTML, CSP compatibility, dữ liệu seed, ảnh, tổng tiền, các rule
`.gitignore` cho `bin`/`obj`/`node_modules`, archive/tài liệu nhị phân và file lớn bất
thường. Các thư mục artifact đã được ignore sẽ không làm test thất bại sau khi build.

Các biến môi trường hữu ích:

- `DOTNET_BIN`: đường dẫn executable `dotnet` nếu không nằm trong `PATH`.
- `TEST_PORT`: cổng riêng muốn dùng (mặc định tự chọn cổng loopback còn trống).
- `TEST_STARTUP_TIMEOUT_MS`, `TEST_REQUEST_TIMEOUT_MS`: timeout startup/request.
- `SHOW_BACKEND_LOGS=1`: hiện log backend trong lúc chạy.
- `KEEP_TEST_DATA=1`: giữ thư mục/data tạm để điều tra lỗi.
- `BACKEND_PROJECT`: đường dẫn tới `BackendApp.csproj` khác.

Có thể kiểm tra một backend đang chạy bằng `BASE_URL`, nhưng script cố ý chỉ chấp
nhận localhost/loopback. Đây là chế độ **có thay đổi dữ liệu**: test để lại các đơn
hàng và sản phẩm snapshot, đồng thời tiêu thụ quota đăng nhập theo IP. Chỉ dùng với
backend test có thể bỏ dữ liệu và phải đặt `ALLOW_MUTATING_EXTERNAL=1` để xác nhận.
Nếu script bị ngắt hoặc thất bại giữa chừng, user, sản phẩm hay danh mục tạm cũng có
thể còn lại vì chế độ này không rollback dữ liệu trên server có sẵn.
Ở chế độ này, có thể truyền `BUYER_USERNAME`, `BUYER_PASSWORD`, `STAFF_USERNAME`,
`STAFF_PASSWORD`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` để khớp dữ liệu của server.

Phạm vi smoke test gồm health, frontend/static assets/security headers, catalog
công khai, đăng ký, login và session cookie của ba role, không lộ password, 401/403, buyer
checkout/hủy đơn, hai POST đồng thời + retry idempotent và từ chối giá giỏ hàng đã cũ, staff CRUD sản phẩm và danh mục, snapshot lịch sử, cập nhật trạng
thái đơn, admin CRUD user/revoke cookie, hash PBKDF2 runtime và auth rate limit.
