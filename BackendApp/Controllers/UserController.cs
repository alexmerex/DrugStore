using BackendApp.Models;
using BackendApp.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;

namespace BackendApp.Controllers;

[ApiController]
[Authorize(Roles = "admin")]
[Route("api/users")]
public sealed class UserController : ControllerBase
{
    private static readonly string[] AllowedRoles = ["buyer", "staff", "admin"];
    private readonly JsonDataStore _store;
    private readonly PasswordService _passwordService;

    public UserController(JsonDataStore store, PasswordService passwordService)
    {
        _store = store;
        _passwordService = passwordService;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<UserResponse>>> GetAll(CancellationToken cancellationToken)
    {
        var users = await _store.ReadAsync(data => data.Users
            .OrderBy(user => user.UserID)
            .Select(ToResponse)
            .ToList(), cancellationToken);
        return Ok(users);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<UserResponse>> GetById(int id, CancellationToken cancellationToken)
    {
        var user = await _store.ReadAsync(data => data.Users
            .Where(item => item.UserID == id)
            .Select(ToResponse)
            .FirstOrDefault(), cancellationToken);
        return user is null ? NotFound() : Ok(user);
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateUserRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Password))
        {
            ModelState.AddModelError(nameof(request.Password), "Mật khẩu không được chỉ chứa khoảng trắng.");
            return ValidationProblem(ModelState);
        }

        var role = request.Role.Trim().ToLowerInvariant();
        if (!AllowedRoles.Contains(role))
        {
            ModelState.AddModelError(nameof(request.Role), "Vai trò không hợp lệ.");
            return ValidationProblem(ModelState);
        }

        var result = await _store.WriteAsync(data =>
        {
            var username = request.Username.Trim();
            if (data.Users.Any(user =>
                string.Equals(user.UserName, username, StringComparison.OrdinalIgnoreCase)))
            {
                return (User: (User?)null, Duplicate: true);
            }

            var user = new User
            {
                UserID = JsonDataStore.NextId(data.Users, item => item.UserID),
                UserName = username,
                Role = role,
                Password = _passwordService.Hash(request.Password)
            };
            data.Users.Add(user);
            return (User: user, Duplicate: false);
        }, cancellationToken);

        if (result.Duplicate || result.User is null)
        {
            return Conflict(new ProblemDetails { Status = 409, Title = "Tên đăng nhập đã tồn tại." });
        }

        return CreatedAtAction(nameof(GetById), new { id = result.User.UserID }, ToResponse(result.User));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(
        int id,
        UpdateUserRequest request,
        CancellationToken cancellationToken)
    {
        if (request.Password is not null && string.IsNullOrWhiteSpace(request.Password))
        {
            ModelState.AddModelError(nameof(request.Password), "Mật khẩu mới không được chỉ chứa khoảng trắng.");
            return ValidationProblem(ModelState);
        }

        var role = request.Role.Trim().ToLowerInvariant();
        if (!AllowedRoles.Contains(role))
        {
            ModelState.AddModelError(nameof(request.Role), "Vai trò không hợp lệ.");
            return ValidationProblem(ModelState);
        }

        var currentUserId = User.GetUserId();
        var result = await _store.WriteAsync(data =>
        {
            var user = data.Users.FirstOrDefault(item => item.UserID == id);
            if (user is null)
            {
                return UpdateUserResult.NotFound;
            }

            var username = request.Username.Trim();
            if (data.Users.Any(item => item.UserID != id &&
                string.Equals(item.UserName, username, StringComparison.OrdinalIgnoreCase)))
            {
                return UpdateUserResult.Duplicate;
            }

            if (user.Role == "admin" && role != "admin" &&
                data.Users.Count(item => item.Role == "admin") == 1)
            {
                return UpdateUserResult.LastAdmin;
            }

            if (id == currentUserId && role != "admin")
            {
                return UpdateUserResult.SelfDemotion;
            }

            user.UserName = username;
            user.Role = role;
            if (request.Password is not null)
            {
                user.Password = _passwordService.Hash(request.Password);
            }

            return UpdateUserResult.Success;
        }, cancellationToken);

        return result switch
        {
            UpdateUserResult.NotFound => NotFound(),
            UpdateUserResult.Duplicate => Conflict(new ProblemDetails { Status = 409, Title = "Tên đăng nhập đã tồn tại." }),
            UpdateUserResult.LastAdmin => Conflict(new ProblemDetails { Status = 409, Title = "Hệ thống phải còn ít nhất một quản trị viên." }),
            UpdateUserResult.SelfDemotion => BadRequest(new ProblemDetails { Status = 400, Title = "Bạn không thể tự hạ quyền tài khoản đang đăng nhập." }),
            _ => NoContent()
        };
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        if (id == User.GetUserId())
        {
            return BadRequest(new ProblemDetails { Status = 400, Title = "Bạn không thể xóa tài khoản đang đăng nhập." });
        }

        var result = await _store.WriteAsync(data =>
        {
            var user = data.Users.FirstOrDefault(item => item.UserID == id);
            if (user is null)
            {
                return DeleteUserResult.NotFound;
            }

            if (user.Role == "admin" && data.Users.Count(item => item.Role == "admin") == 1)
            {
                return DeleteUserResult.LastAdmin;
            }

            if (data.Bills.Any(bill => bill.BuyerID == id || bill.StaffID == id))
            {
                return DeleteUserResult.Referenced;
            }

            data.Users.Remove(user);
            return DeleteUserResult.Success;
        }, cancellationToken);

        return result switch
        {
            DeleteUserResult.NotFound => NotFound(),
            DeleteUserResult.LastAdmin => Conflict(new ProblemDetails { Status = 409, Title = "Hệ thống phải còn ít nhất một quản trị viên." }),
            DeleteUserResult.Referenced => Conflict(new ProblemDetails { Status = 409, Title = "Tài khoản đã phát sinh đơn hàng nên không thể xóa." }),
            _ => NoContent()
        };
    }

    private static UserResponse ToResponse(User user)
        => new(user.UserID, user.UserName, user.Role);

    public sealed record UserResponse(int UserID, string Username, string Role);

    public sealed class CreateUserRequest
    {
        [Required, StringLength(60, MinimumLength = 3)]
        [RegularExpression(@"^[\p{L}\p{N}._-]+$",
            ErrorMessage = "Tên đăng nhập chứa ký tự không hợp lệ.")]
        public string Username { get; set; } = string.Empty;

        [Required, StringLength(20)]
        public string Role { get; set; } = string.Empty;

        [Required, StringLength(128, MinimumLength = 8)]
        public string Password { get; set; } = string.Empty;
    }

    public sealed class UpdateUserRequest
    {
        [Required, StringLength(60, MinimumLength = 3)]
        [RegularExpression(@"^[\p{L}\p{N}._-]+$",
            ErrorMessage = "Tên đăng nhập chứa ký tự không hợp lệ.")]
        public string Username { get; set; } = string.Empty;

        [Required, StringLength(20)]
        public string Role { get; set; } = string.Empty;

        [StringLength(128, MinimumLength = 8)]
        public string? Password { get; set; }
    }

    private enum UpdateUserResult { Success, NotFound, Duplicate, LastAdmin, SelfDemotion }
    private enum DeleteUserResult { Success, NotFound, LastAdmin, Referenced }
}
