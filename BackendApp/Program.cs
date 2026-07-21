using BackendApp.Services;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Net;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.DictionaryKeyPolicy = JsonNamingPolicy.CamelCase;
    });

builder.Services.AddSingleton<PasswordService>();
builder.Services.AddSingleton<JsonDataStore>();

builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "DrugStore.Session";
        options.Cookie.HttpOnly = true;
        options.Cookie.IsEssential = true;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.Cookie.SecurePolicy =
            (builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("Testing"))
                ? CookieSecurePolicy.SameAsRequest
                : CookieSecurePolicy.Always;
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        options.SlidingExpiration = true;
        options.Events.OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return context.Response.WriteAsJsonAsync(new ProblemDetails
            {
                Status = StatusCodes.Status401Unauthorized,
                Title = "Bạn cần đăng nhập để thực hiện thao tác này."
            });
        };
        options.Events.OnRedirectToAccessDenied = context =>
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return context.Response.WriteAsJsonAsync(new ProblemDetails
            {
                Status = StatusCodes.Status403Forbidden,
                Title = "Bạn không có quyền thực hiện thao tác này."
            });
        };
        options.Events.OnValidatePrincipal = async context =>
        {
            if (!context.Request.Path.StartsWithSegments("/api"))
            {
                return;
            }

            var idValue = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
            var role = context.Principal?.FindFirstValue(ClaimTypes.Role);
            var username = context.Principal?.Identity?.Name;
            var passwordMarker = context.Principal?.FindFirstValue("password_marker");

            if (!int.TryParse(idValue, out var userId))
            {
                context.RejectPrincipal();
                return;
            }

            var store = context.HttpContext.RequestServices.GetRequiredService<JsonDataStore>();
            var isCurrent = await store.ReadAsync(data => data.Users.Any(user =>
                user.UserID == userId &&
                user.UserName == username &&
                user.Role == role &&
                user.Password == passwordMarker), context.HttpContext.RequestAborted);

            if (!isCurrent)
            {
                context.RejectPrincipal();
                context.HttpContext.Response.Cookies.Delete("DrugStore.Session");
            }
        };
    });

builder.Services.AddAuthorization();
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;
    foreach (var section in builder.Configuration.GetSection("DrugStore:KnownProxies").GetChildren())
    {
        if (!IPAddress.TryParse(section.Value, out var address))
        {
            throw new InvalidOperationException($"Invalid trusted proxy address: {section.Value}");
        }

        options.KnownProxies.Add(address);
    }
});
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        var retryAfterSeconds = 60;
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            retryAfterSeconds = Math.Max(1, (int)Math.Ceiling(retryAfter.TotalSeconds));
        }
        context.HttpContext.Response.Headers["Retry-After"] = retryAfterSeconds.ToString();

        await context.HttpContext.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = StatusCodes.Status429TooManyRequests,
            Title = "Bạn thao tác quá nhanh. Vui lòng thử lại sau."
        }, cancellationToken: cancellationToken);
    };
    options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        }));
});

var app = builder.Build();
var dataStore = app.Services.GetRequiredService<JsonDataStore>();
await dataStore.InitializeAsync();

app.UseForwardedHeaders();
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        var exception = context.Features.Get<IExceptionHandlerFeature>()?.Error;
        app.Logger.LogError(exception, "Unhandled request error");

        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/problem+json";
        await context.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = StatusCodes.Status500InternalServerError,
            Title = "Không thể xử lý yêu cầu lúc này.",
            Detail = app.Environment.IsDevelopment() ? exception?.Message : null
        });
    });
});

app.UseStatusCodePages(async statusContext =>
{
    var context = statusContext.HttpContext;
    if (!context.Request.Path.StartsWithSegments("/api") ||
        context.Response.StatusCode < 400)
    {
        return;
    }

    var title = context.Response.StatusCode switch
    {
        StatusCodes.Status400BadRequest => "Yêu cầu chưa hợp lệ.",
        StatusCodes.Status404NotFound => "Không tìm thấy dữ liệu yêu cầu.",
        StatusCodes.Status405MethodNotAllowed => "Phương thức HTTP không được hỗ trợ.",
        StatusCodes.Status415UnsupportedMediaType => "Định dạng nội dung không được hỗ trợ.",
        _ => "Không thể hoàn tất yêu cầu."
    };
    await context.Response.WriteAsJsonAsync(new ProblemDetails
    {
        Status = context.Response.StatusCode,
        Title = title
    }, cancellationToken: context.RequestAborted);
});

if (!app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("Testing"))
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.Use(async (context, next) =>
{
    context.Response.Headers["Content-Security-Policy"] =
        "default-src 'self'; img-src 'self' data: https:; style-src 'self'; " +
        "script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; " +
        "form-action 'self'; frame-ancestors 'none'";
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    context.Response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
    context.Response.Headers["Cross-Origin-Opener-Policy"] = "same-origin";
    context.Response.Headers["Cross-Origin-Resource-Policy"] = "same-origin";
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        context.Response.Headers["Cache-Control"] = "no-store";
    }
    await next();
});

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    service = "DrugStore API",
    time = DateTimeOffset.UtcNow
}));
app.MapGet("/main.html", () => Results.Redirect("/"));
app.MapGet("/thuoc.html", (HttpRequest request) =>
{
    var productId = request.Query["id"].FirstOrDefault()
        ?? request.Query["idProduct"].FirstOrDefault();
    var target = string.IsNullOrWhiteSpace(productId)
        ? "/product.html"
        : $"/product.html?id={Uri.EscapeDataString(productId)}";
    return Results.Redirect(target);
});

app.Run();

public partial class Program { }
