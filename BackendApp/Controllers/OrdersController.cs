using BackendApp.Models;
using BackendApp.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;

namespace BackendApp.Controllers;

[ApiController]
[Authorize]
[Route("api/orders")]
public sealed class OrdersController : ControllerBase
{
    private readonly JsonDataStore _store;

    public OrdersController(JsonDataStore store) => _store = store;

    [Authorize(Roles = "buyer")]
    [HttpGet("mine")]
    public async Task<IActionResult> Mine(CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        var orders = await _store.ReadAsync(data => data.Bills
            .Where(bill => bill.BuyerID == userId)
            .OrderByDescending(bill => bill.Date)
            .Select(bill => ToResponse(data, bill))
            .ToList(), cancellationToken);
        return Ok(orders);
    }

    [Authorize(Roles = "staff,admin")]
    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken)
    {
        var orders = await _store.ReadAsync(data => data.Bills
            .OrderByDescending(bill => bill.Date)
            .Select(bill => ToResponse(data, bill))
            .ToList(), cancellationToken);
        return Ok(orders);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        var isStaff = User.IsInRole("staff") || User.IsInRole("admin");
        var result = await _store.ReadAsync(data =>
        {
            var bill = data.Bills.FirstOrDefault(item => item.BillID == id);
            if (bill is null)
            {
                return (Order: (OrderResponse?)null, Forbidden: false);
            }

            if (!isStaff && bill.BuyerID != userId)
            {
                return (Order: (OrderResponse?)null, Forbidden: true);
            }

            return (Order: (OrderResponse?)ToResponse(data, bill), Forbidden: false);
        }, cancellationToken);

        if (result.Forbidden)
        {
            return NotFound();
        }

        return result.Order is null ? NotFound() : Ok(result.Order);
    }

    [Authorize(Roles = "buyer")]
    [HttpPost]
    public async Task<IActionResult> Create(CreateOrderRequest request, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (request.Items.Any(item => item is null))
        {
            ModelState.AddModelError(nameof(request.Items), "Giỏ hàng chứa dòng sản phẩm không hợp lệ.");
            return ValidationProblem(ModelState);
        }

        if (request.Items.Any(item => item.ExpectedUnitPrice.HasValue
            && item.ExpectedUnitPrice.Value != decimal.Truncate(item.ExpectedUnitPrice.Value)))
        {
            ModelState.AddModelError(nameof(request.Items), "Giá dự kiến phải là số nguyên đồng.");
            return ValidationProblem(ModelState);
        }

        var requestedItems = request.Items
            .OfType<CreateOrderItemRequest>()
            .GroupBy(item => item.ProductID)
            .Select(group => new
            {
                ProductID = group.Key,
                Quantity = group.Sum(item => item.Quantity),
                ExpectedUnitPrices = group
                    .Where(item => item.ExpectedUnitPrice.HasValue)
                    .Select(item => item.ExpectedUnitPrice.GetValueOrDefault())
                    .Distinct()
                    .ToList()
            })
            .ToList();

        if (requestedItems.Any(item => item.Quantity is < 1 or > 99))
        {
            ModelState.AddModelError(nameof(request.Items), "Mỗi sản phẩm phải có số lượng từ 1 đến 99.");
            return ValidationProblem(ModelState);
        }

        if (requestedItems.Any(item => item.ExpectedUnitPrices.Count > 1))
        {
            ModelState.AddModelError(nameof(request.Items), "Mỗi sản phẩm chỉ được gửi kèm một mức giá dự kiến.");
            return ValidationProblem(ModelState);
        }

        var idempotencyKey = request.IdempotencyKey?.Trim() ?? string.Empty;
        var idempotencyFingerprint = idempotencyKey.Length == 0
            ? string.Empty
            : OrderIdempotency.CreateFingerprint(requestedItems.Select(item => new OrderIdempotency.Item(
                item.ProductID,
                item.Quantity,
                item.ExpectedUnitPrices.Count == 0 ? null : item.ExpectedUnitPrices[0])));

        var result = await _store.WriteAsync(data =>
        {
            if (!data.Users.Any(user => user.UserID == userId && user.Role == "buyer"))
            {
                return new CreateOrderResult(CreateOrderStatus.InvalidBuyer, 0, null);
            }

            if (idempotencyKey.Length > 0)
            {
                var existingBill = data.Bills.FirstOrDefault(bill =>
                    bill.BuyerID == userId && bill.IdempotencyKey == idempotencyKey);
                if (existingBill is not null)
                {
                    var sameRequest = existingBill.IdempotencyFingerprint == idempotencyFingerprint;
                    return new CreateOrderResult(
                        sameRequest
                            ? CreateOrderStatus.ExistingOrder
                            : CreateOrderStatus.IdempotencyConflict,
                        existingBill.BillID,
                        sameRequest ? ToResponse(data, existingBill) : null);
                }
            }

            var productMap = data.Products.ToDictionary(product => product.IDProduct);
            if (requestedItems.Any(item => !productMap.ContainsKey(item.ProductID)))
            {
                return new CreateOrderResult(CreateOrderStatus.MissingProduct, 0, null);
            }

            if (requestedItems.Any(item => item.ExpectedUnitPrices.Count == 1
                && productMap[item.ProductID].Price != item.ExpectedUnitPrices[0]))
            {
                return new CreateOrderResult(CreateOrderStatus.PriceChanged, 0, null);
            }

            var billId = JsonDataStore.NextId(data.Bills, bill => bill.BillID);
            var details = requestedItems.Select(item =>
            {
                var product = productMap[item.ProductID];
                return new BillDetail
                {
                    BillDetailID = 0,
                    BillID = billId,
                    IDProduct = product.IDProduct,
                    Quantity = item.Quantity,
                    Price = product.Price,
                    ProductName = product.Name,
                    Unit = product.Unit,
                    Image_URL = product.Image_URL,
                    RegistrationNumber = product.RegistrationNumber
                };
            }).ToList();

            var nextDetailId = JsonDataStore.NextId(data.BillDetails, detail => detail.BillDetailID);
            foreach (var detail in details)
            {
                detail.BillDetailID = nextDetailId++;
            }

            var bill = new Bill
            {
                BillID = billId,
                BuyerID = userId,
                StaffID = 0,
                Discount = 0,
                Tax = 0,
                Date = DateTime.UtcNow,
                Total = details.Sum(detail => detail.Price * detail.Quantity),
                Status = "new",
                IdempotencyKey = idempotencyKey,
                IdempotencyFingerprint = idempotencyFingerprint
            };

            data.Bills.Add(bill);
            data.BillDetails.AddRange(details);
            return new CreateOrderResult(CreateOrderStatus.Success, billId, ToResponse(data, bill));
        }, cancellationToken);

        if (result.Status == CreateOrderStatus.MissingProduct)
        {
            return BadRequest(new ProblemDetails
            {
                Status = 400,
                Title = "Giỏ hàng có sản phẩm không còn tồn tại."
            });
        }

        if (result.Status == CreateOrderStatus.PriceChanged)
        {
            return Conflict(new ProblemDetails
            {
                Type = "/problems/price-changed",
                Status = 409,
                Title = "Giá sản phẩm đã thay đổi. Vui lòng kiểm tra lại giỏ hàng trước khi đặt."
            });
        }

        if (result.Status == CreateOrderStatus.IdempotencyConflict)
        {
            return Conflict(new ProblemDetails
            {
                Type = "/problems/idempotency-conflict",
                Status = 409,
                Title = "Khóa checkout đã được dùng cho một nội dung giỏ hàng khác."
            });
        }

        if (result.Status is not (CreateOrderStatus.Success or CreateOrderStatus.ExistingOrder))
        {
            return Forbid();
        }

        return result.Status == CreateOrderStatus.ExistingOrder
            ? Ok(result.Order)
            : CreatedAtAction(nameof(GetById), new { id = result.BillID }, result.Order);
    }

    [HttpPatch("{id:int}/status")]
    public async Task<IActionResult> UpdateStatus(
        int id,
        UpdateStatusRequest request,
        CancellationToken cancellationToken)
    {
        var normalizedStatus = JsonDataStore.NormalizeStatus(request.Status);
        var isStaff = User.IsInRole("staff") || User.IsInRole("admin");
        var userId = User.GetUserId();

        var result = await _store.WriteAsync(data =>
        {
            var bill = data.Bills.FirstOrDefault(item => item.BillID == id);
            if (bill is null)
            {
                return UpdateOrderStatus.NotFound;
            }

            if (!isStaff)
            {
                if (bill.BuyerID != userId)
                {
                    return UpdateOrderStatus.NotFound;
                }

                if (normalizedStatus != "cancelled" || bill.Status != "new")
                {
                    return UpdateOrderStatus.Forbidden;
                }
            }

            if (bill.Status is "completed" or "cancelled")
            {
                return UpdateOrderStatus.Finalized;
            }

            if (isStaff && !CanTransition(bill.Status, normalizedStatus))
            {
                return UpdateOrderStatus.InvalidTransition;
            }

            bill.Status = normalizedStatus;
            if (isStaff && bill.StaffID == 0)
            {
                bill.StaffID = userId;
            }
            return UpdateOrderStatus.Success;
        }, cancellationToken);

        return result switch
        {
            UpdateOrderStatus.NotFound => NotFound(),
            UpdateOrderStatus.Forbidden => Forbid(),
            UpdateOrderStatus.Finalized => Conflict(new ProblemDetails
            {
                Status = 409,
                Title = "Đơn hàng đã kết thúc và không thể đổi trạng thái."
            }),
            UpdateOrderStatus.InvalidTransition => Conflict(new ProblemDetails
            {
                Status = 409,
                Title = "Không thể chuyển đơn hàng về trạng thái trước đó."
            }),
            _ => NoContent()
        };
    }

    private static bool CanTransition(string current, string target) => current switch
    {
        "new" => target is "processing" or "cancelled",
        "processing" => target is "completed" or "cancelled",
        _ => false
    };

    private static OrderResponse ToResponse(StoreData data, Bill bill)
    {
        var buyer = data.Users.FirstOrDefault(user => user.UserID == bill.BuyerID);
        var staff = data.Users.FirstOrDefault(user => user.UserID == bill.StaffID);
        var items = data.BillDetails
            .Where(detail => detail.BillID == bill.BillID)
            .Select(detail =>
            {
                var product = data.Products.FirstOrDefault(item => item.IDProduct == detail.IDProduct);
                return new OrderItemResponse(
                    detail.IDProduct,
                    string.IsNullOrWhiteSpace(detail.ProductName)
                        ? product?.Name ?? "Sản phẩm không còn tồn tại"
                        : detail.ProductName,
                    detail.Unit,
                    detail.RegistrationNumber,
                    string.IsNullOrWhiteSpace(detail.Image_URL)
                        ? product?.Image_URL ?? string.Empty
                        : detail.Image_URL,
                    detail.Quantity,
                    detail.Price,
                    detail.Price * detail.Quantity);
            })
            .ToList();

        return new OrderResponse(
            bill.BillID,
            bill.BuyerID,
            buyer?.UserName ?? "Không xác định",
            bill.StaffID,
            staff?.UserName,
            bill.Discount,
            bill.Tax,
            bill.Date,
            bill.Total,
            bill.Status,
            items);
    }

    public sealed class CreateOrderRequest
    {
        [Required, MinLength(1, ErrorMessage = "Giỏ hàng đang trống."), MaxLength(100)]
        public List<CreateOrderItemRequest> Items { get; set; } = [];

        [StringLength(100, MinimumLength = 16)]
        [RegularExpression("^[A-Za-z0-9][A-Za-z0-9._:-]{15,99}$")]
        public string? IdempotencyKey { get; set; }
    }

    public sealed class CreateOrderItemRequest
    {
        [Range(1, int.MaxValue)]
        public int ProductID { get; set; }

        [Range(1, 99)]
        public int Quantity { get; set; }

        [Range(typeof(decimal), "0", "1000000000")]
        public decimal? ExpectedUnitPrice { get; set; }
    }

    public sealed class UpdateStatusRequest
    {
        [Required, RegularExpression("^(new|processing|completed|cancelled)$")]
        public string Status { get; set; } = string.Empty;
    }

    public sealed record OrderItemResponse(
        int ProductID,
        string ProductName,
        string Unit,
        string RegistrationNumber,
        string ImageURL,
        int Quantity,
        decimal UnitPrice,
        decimal LineTotal);

    public sealed record OrderResponse(
        int OrderID,
        int BuyerID,
        string BuyerName,
        int StaffID,
        string? StaffName,
        decimal Discount,
        decimal Tax,
        DateTime Date,
        decimal Total,
        string Status,
        IReadOnlyList<OrderItemResponse> Items);

    private sealed record CreateOrderResult(CreateOrderStatus Status, int BillID, OrderResponse? Order);
    private enum CreateOrderStatus
    {
        Success,
        ExistingOrder,
        InvalidBuyer,
        MissingProduct,
        PriceChanged,
        IdempotencyConflict
    }
    private enum UpdateOrderStatus { Success, NotFound, Forbidden, Finalized, InvalidTransition }
}
