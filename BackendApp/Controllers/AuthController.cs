using BackendApp.Models;
using BackendApp.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;

namespace BackendApp.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly JsonDataStore _store;
    private readonly PasswordService _passwordService;

    public AuthController(JsonDataStore store, PasswordService passwordService)
    {
        _store = store;
        _passwordService = passwordService;
    }

    [AllowAnonymous]
    [HttpGet("session")]
    public IActionResult Session()
    {
        if (User.Identity?.IsAuthenticated != true)
        {
            return Ok(new { authenticated = false });
        }

        return Ok(new
        {
            authenticated = true,
            user = CurrentUserSummary()
        });
    }

    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request, CancellationToken cancellationToken)
    {
        var user = await _store.ReadAsync(data => data.Users
            .FirstOrDefault(candidate =>
                string.Equals(candidate.UserName, request.Username.Trim(), StringComparison.OrdinalIgnoreCase)),
            cancellationToken);

        if (user is null || !_passwordService.Verify(request.Password, user.Password))
        {
            return Unauthorized(new ProblemDetails
            {
                Status = StatusCodes.Status401Unauthorized,
                Title = "Tên đăng nhập hoặc mật khẩu không đúng."
            });
        }

        await SignInAsync(user);
        return Ok(new { user = ToSummary(user) });
    }

    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Password))
        {
            ModelState.AddModelError(nameof(request.Password), "Mật khẩu không được chỉ chứa khoảng trắng.");
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
                Password = _passwordService.Hash(request.Password),
                Role = "buyer"
            };
            data.Users.Add(user);
            return (User: user, Duplicate: false);
        }, cancellationToken);

        if (result.Duplicate || result.User is null)
        {
            return Conflict(new ProblemDetails
            {
                Status = StatusCodes.Status409Conflict,
                Title = "Tên đăng nhập đã tồn tại."
            });
        }

        await SignInAsync(result.User);
        return Created("/api/auth/session", new { user = ToSummary(result.User) });
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return NoContent();
    }

    private async Task SignInAsync(User user)
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.UserID.ToString()),
            new Claim(ClaimTypes.Name, user.UserName),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim("password_marker", user.Password)
        };
        var principal = new ClaimsPrincipal(
            new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme));

        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            principal,
            new AuthenticationProperties
            {
                IsPersistent = false,
                AllowRefresh = true
            });
    }

    private object CurrentUserSummary() => new
    {
        userID = User.GetUserId(),
        username = User.Identity?.Name ?? string.Empty,
        role = User.FindFirstValue(ClaimTypes.Role) ?? "buyer"
    };

    private static object ToSummary(User user) => new
    {
        userID = user.UserID,
        username = user.UserName,
        role = user.Role
    };

    public sealed class LoginRequest
    {
        [Required, StringLength(60, MinimumLength = 3)]
        public string Username { get; set; } = string.Empty;

        [Required, StringLength(128)]
        public string Password { get; set; } = string.Empty;
    }

    public sealed class RegisterRequest
    {
        [Required, StringLength(60, MinimumLength = 3)]
        [RegularExpression(@"^[\p{L}\p{N}._-]+$",
            ErrorMessage = "Tên đăng nhập chỉ được chứa chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.")]
        public string Username { get; set; } = string.Empty;

        [Required, StringLength(128, MinimumLength = 8,
            ErrorMessage = "Mật khẩu phải có ít nhất 8 ký tự.")]
        public string Password { get; set; } = string.Empty;
    }
}
