using BackendApp.Models;
using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace BackendApp.Services;

public sealed class JsonDataStore
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly string _databasePath;
    private readonly string _seedPath;
    private readonly bool _allowDemoSeed;
    private readonly string? _bootstrapAdminUsername;
    private readonly string? _bootstrapAdminPassword;
    private readonly PasswordService _passwordService;
    private readonly ILogger<JsonDataStore> _logger;
    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true
    };
    private bool _initialized;

    public JsonDataStore(
        IWebHostEnvironment environment,
        IConfiguration configuration,
        PasswordService passwordService,
        ILogger<JsonDataStore> logger)
    {
        var configuredPath = configuration["DrugStore:DataFilePath"];
        _databasePath = string.IsNullOrWhiteSpace(configuredPath)
            ? Path.Combine(environment.ContentRootPath, "App_Data", "database.json")
            : Path.GetFullPath(configuredPath, environment.ContentRootPath);
        var webRootPath = Path.GetFullPath(string.IsNullOrWhiteSpace(environment.WebRootPath)
            ? Path.Combine(environment.ContentRootPath, "wwwroot")
            : environment.WebRootPath);
        if (IsPathWithin(webRootPath, _databasePath))
        {
            throw new InvalidOperationException("DrugStore:DataFilePath must not point inside wwwroot.");
        }

        _seedPath = Path.Combine(environment.ContentRootPath, "Data", "seed.json");
        if (PathsEqual(_seedPath, _databasePath))
        {
            throw new InvalidOperationException("DrugStore:DataFilePath must not overwrite Data/seed.json.");
        }

        _allowDemoSeed = environment.IsDevelopment()
            || environment.IsEnvironment("Testing")
            || configuration.GetValue<bool>("DrugStore:AllowDemoSeed");
        _bootstrapAdminUsername = configuration["DrugStore:BootstrapAdminUsername"];
        _bootstrapAdminPassword = configuration["DrugStore:BootstrapAdminPassword"];
        _passwordService = passwordService;
        _logger = logger;
    }

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            await EnsureInitializedLockedAsync(cancellationToken);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<TResult> ReadAsync<TResult>(
        Func<StoreData, TResult> reader,
        CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            await EnsureInitializedLockedAsync(cancellationToken);
            var data = await LoadLockedAsync(cancellationToken);
            return reader(data);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<TResult> WriteAsync<TResult>(
        Func<StoreData, TResult> writer,
        CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            await EnsureInitializedLockedAsync(cancellationToken);
            var data = await LoadLockedAsync(cancellationToken);
            var result = writer(data);
            Normalize(data);
            Validate(data);
            await SaveLockedAsync(data, cancellationToken);
            return result;
        }
        finally
        {
            _gate.Release();
        }
    }

    public static int NextId<T>(IEnumerable<T> items, Func<T, int> selector)
        => items.Select(selector).DefaultIfEmpty(0).Max() + 1;

    private async Task EnsureInitializedLockedAsync(CancellationToken cancellationToken)
    {
        if (_initialized)
        {
            return;
        }

        Directory.CreateDirectory(Path.GetDirectoryName(_databasePath)!);

        if (!File.Exists(_databasePath))
        {
            if (_allowDemoSeed && File.Exists(_seedPath))
            {
                File.Copy(_seedPath, _databasePath);
            }
            else if (IsValidBootstrapAdmin())
            {
                var initialData = new StoreData
                {
                    Users =
                    [
                        new User
                        {
                            UserID = 1,
                            UserName = _bootstrapAdminUsername!.Trim(),
                            Role = "admin",
                            Password = _passwordService.Hash(_bootstrapAdminPassword!)
                        }
                    ]
                };
                Normalize(initialData);
                Validate(initialData);
                await SaveLockedAsync(initialData, cancellationToken);
                _logger.LogInformation("Created the initial administrator from protected configuration.");
            }
            else
            {
                throw new InvalidOperationException(
                    "Runtime data is missing. In Production, configure DrugStore:BootstrapAdminUsername " +
                    "and a BootstrapAdminPassword of at least 12 characters, or provision the data file explicitly.");
            }
        }

        var data = await LoadLockedAsync(cancellationToken);
        EnsureCollections(data);
        var migratedPasswords = false;

        foreach (var user in data.Users.Where(user => !_passwordService.IsHash(user.Password)))
        {
            if (string.IsNullOrWhiteSpace(user.Password))
            {
                throw new InvalidDataException($"Tài khoản {user.UserName} không có mật khẩu hợp lệ.");
            }

            user.Password = _passwordService.Hash(user.Password);
            migratedPasswords = true;
        }

        Normalize(data);
        var bootstrappedAdministrator = EnsureAdministrator(data);
        Validate(data);
        if (migratedPasswords)
        {
            _logger.LogInformation("Migrated legacy account passwords to PBKDF2.");
        }
        if (bootstrappedAdministrator)
        {
            _logger.LogWarning("Created or promoted the configured bootstrap administrator because no admin existed.");
        }

        await SaveLockedAsync(data, cancellationToken);
        _initialized = true;
    }

    private bool IsValidBootstrapAdmin()
        => IsValidUsername(_bootstrapAdminUsername)
           && !string.IsNullOrWhiteSpace(_bootstrapAdminPassword)
           && _bootstrapAdminPassword.Length is >= 12 and <= 128;

    private bool EnsureAdministrator(StoreData data)
    {
        if (data.Users.Any(user => user.Role == "admin"))
        {
            return false;
        }

        if (!IsValidBootstrapAdmin())
        {
            throw new InvalidDataException(
                "Runtime data must contain at least one administrator. Configure " +
                "DrugStore:BootstrapAdminUsername and a 12-128 character BootstrapAdminPassword.");
        }

        var username = _bootstrapAdminUsername!.Trim();
        var administrator = data.Users.FirstOrDefault(user =>
            string.Equals(user.UserName, username, StringComparison.OrdinalIgnoreCase));
        if (administrator is null)
        {
            administrator = new User
            {
                UserID = NextId(data.Users, user => user.UserID),
                UserName = username
            };
            data.Users.Add(administrator);
        }

        administrator.UserName = username;
        administrator.Role = "admin";
        administrator.Password = _passwordService.Hash(_bootstrapAdminPassword!);
        return true;
    }

    private async Task<StoreData> LoadLockedAsync(CancellationToken cancellationToken)
    {
        await using var stream = File.OpenRead(_databasePath);
        return await JsonSerializer.DeserializeAsync<StoreData>(stream, _jsonOptions, cancellationToken)
            ?? new StoreData();
    }

    private async Task SaveLockedAsync(StoreData data, CancellationToken cancellationToken)
    {
        var directory = Path.GetDirectoryName(_databasePath)!;
        Directory.CreateDirectory(directory);
        var temporaryPath = Path.Combine(directory, $".database.{Guid.NewGuid():N}.tmp");

        try
        {
            await using (var stream = new FileStream(
                temporaryPath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                16_384,
                FileOptions.Asynchronous | FileOptions.WriteThrough))
            {
                await JsonSerializer.SerializeAsync(stream, data, _jsonOptions, cancellationToken);
                await stream.FlushAsync(cancellationToken);
            }

            File.Move(temporaryPath, _databasePath, true);
        }
        finally
        {
            if (File.Exists(temporaryPath))
            {
                File.Delete(temporaryPath);
            }
        }
    }

    private static void Normalize(StoreData data)
    {
        EnsureCollections(data);

        foreach (var user in data.Users)
        {
            user.UserName = user.UserName?.Trim() ?? string.Empty;
            user.Role = NormalizeRole(user.Role);
        }

        foreach (var category in data.Categories)
        {
            category.Name = category.Name?.Trim() ?? string.Empty;
        }

        foreach (var product in data.Products)
        {
            product.Name = product.Name?.Trim() ?? string.Empty;
            product.Unit = product.Unit?.Trim() ?? string.Empty;
            product.Type = product.Type?.Trim() ?? string.Empty;
            product.DosageForms = product.DosageForms?.Trim() ?? string.Empty;
            product.Packing = product.Packing?.Trim() ?? string.Empty;
            product.BrandOrigin = product.BrandOrigin?.Trim() ?? string.Empty;
            product.Producer = product.Producer?.Trim() ?? string.Empty;
            product.ManufacturingCountry = product.ManufacturingCountry?.Trim() ?? string.Empty;
            product.Ingredient = product.Ingredient?.Trim() ?? string.Empty;
            product.ShortDescription = product.ShortDescription?.Trim() ?? string.Empty;
            product.RegistrationNumber = product.RegistrationNumber?.Trim() ?? string.Empty;
            product.Image_URL = product.Image_URL?.Trim() ?? string.Empty;
        }

        foreach (var detail in data.BillDetails)
        {
            var product = data.Products.FirstOrDefault(item => item.IDProduct == detail.IDProduct);
            detail.ProductName = string.IsNullOrWhiteSpace(detail.ProductName)
                ? product?.Name ?? string.Empty
                : detail.ProductName.Trim();
            detail.Unit = string.IsNullOrWhiteSpace(detail.Unit)
                ? product?.Unit ?? string.Empty
                : detail.Unit.Trim();
            detail.Image_URL = string.IsNullOrWhiteSpace(detail.Image_URL)
                ? product?.Image_URL ?? string.Empty
                : detail.Image_URL.Trim();
            detail.RegistrationNumber = string.IsNullOrWhiteSpace(detail.RegistrationNumber)
                ? product?.RegistrationNumber ?? string.Empty
                : detail.RegistrationNumber.Trim();
        }

        foreach (var bill in data.Bills)
        {
            bill.Status = NormalizeStatus(bill.Status);
            bill.IdempotencyKey = bill.IdempotencyKey?.Trim() ?? string.Empty;
            bill.IdempotencyFingerprint = bill.IdempotencyFingerprint?.Trim().ToUpperInvariant() ?? string.Empty;
            if (bill.IdempotencyKey.Length > 0 && bill.IdempotencyFingerprint.Length == 0)
            {
                var legacyItems = data.BillDetails
                    .Where(detail => detail.BillID == bill.BillID)
                    .GroupBy(detail => detail.IDProduct)
                    .Select(group =>
                    {
                        var prices = group.Select(detail => detail.Price).Distinct().ToList();
                        return new OrderIdempotency.Item(
                            group.Key,
                            group.Sum(detail => detail.Quantity),
                            prices.Count == 1 ? prices[0] : null);
                    });
                bill.IdempotencyFingerprint = OrderIdempotency.CreateFingerprint(legacyItems);
            }
            var subtotal = data.BillDetails
                .Where(detail => detail.BillID == bill.BillID)
                .Sum(detail => detail.Price * detail.Quantity);
            var discounted = subtotal * (1 - Math.Clamp(bill.Discount, 0, 100) / 100);
            bill.Total = decimal.Round(
                discounted * (1 + Math.Clamp(bill.Tax, 0, 100) / 100),
                0,
                MidpointRounding.AwayFromZero);
        }
    }

    private static void EnsureCollections(StoreData data)
    {
        data.Users ??= [];
        data.Categories ??= [];
        data.Products ??= [];
        data.Bills ??= [];
        data.BillDetails ??= [];

        EnsureNoNullItems(data.Users, "User");
        EnsureNoNullItems(data.Categories, "Category");
        EnsureNoNullItems(data.Products, "Product");
        EnsureNoNullItems(data.Bills, "Bill");
        EnsureNoNullItems(data.BillDetails, "BillDetail");
    }

    private static void EnsureNoNullItems<T>(IEnumerable<T> items, string collectionName)
        where T : class
    {
        if (items.Any(item => item is null))
        {
            throw new InvalidDataException($"{collectionName} collection contains a null item.");
        }
    }

    private void Validate(StoreData data)
    {
        EnsureUniquePositiveIds(data.Users, user => user.UserID, "User");
        EnsureUniquePositiveIds(data.Categories, category => category.ID_Category, "Category");
        EnsureUniquePositiveIds(data.Products, product => product.IDProduct, "Product");
        EnsureUniquePositiveIds(data.Bills, bill => bill.BillID, "Bill");
        EnsureUniquePositiveIds(data.BillDetails, detail => detail.BillDetailID, "BillDetail");

        var usernames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var user in data.Users)
        {
            if (!IsValidUsername(user.UserName))
            {
                throw new InvalidDataException($"User #{user.UserID} has an invalid username.");
            }
            if (!usernames.Add(user.UserName))
            {
                throw new InvalidDataException($"Duplicate username: {user.UserName}.");
            }
            if (user.Role != "buyer" && user.Role != "staff" && user.Role != "admin")
            {
                throw new InvalidDataException($"User #{user.UserID} has an invalid role.");
            }
            if (!_passwordService.IsWellFormedHash(user.Password))
            {
                throw new InvalidDataException($"User #{user.UserID} has an invalid password hash.");
            }
        }
        if (!data.Users.Any(user => user.Role == "admin"))
        {
            throw new InvalidDataException("Runtime data must contain at least one administrator.");
        }

        var categoryNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var category in data.Categories)
        {
            ValidateAnnotations(category, $"Category #{category.ID_Category}");
            if (!categoryNames.Add(category.Name))
            {
                throw new InvalidDataException($"Duplicate category name: {category.Name}.");
            }
        }

        var categoryIds = data.Categories.Select(category => category.ID_Category).ToHashSet();
        foreach (var product in data.Products)
        {
            ValidateAnnotations(product, $"Product #{product.IDProduct}");
            if (!categoryIds.Contains(product.ID_Category))
            {
                throw new InvalidDataException($"Product #{product.IDProduct} references a missing category.");
            }
        }

        var userIds = data.Users.Select(user => user.UserID).ToHashSet();
        var billIds = data.Bills.Select(bill => bill.BillID).ToHashSet();
        var productIds = data.Products.Select(product => product.IDProduct).ToHashSet();
        var idempotencyKeys = new HashSet<string>(StringComparer.Ordinal);
        foreach (var bill in data.Bills)
        {
            if (!userIds.Contains(bill.BuyerID) || (bill.StaffID != 0 && !userIds.Contains(bill.StaffID)))
            {
                throw new InvalidDataException($"Bill #{bill.BillID} references a missing user.");
            }
            if (bill.Discount is < 0 or > 100 || bill.Tax is < 0 or > 100 || bill.Date == default)
            {
                throw new InvalidDataException($"Bill #{bill.BillID} has invalid totals or date metadata.");
            }
            if (bill.Status is not ("new" or "processing" or "completed" or "cancelled"))
            {
                throw new InvalidDataException($"Bill #{bill.BillID} has an invalid status.");
            }
            if (bill.IdempotencyKey.Length > 0)
            {
                var validKey = bill.IdempotencyKey.Length is >= 16 and <= 100
                    && char.IsAsciiLetterOrDigit(bill.IdempotencyKey[0])
                    && bill.IdempotencyKey.All(character =>
                        char.IsAsciiLetterOrDigit(character) || character is '.' or '_' or ':' or '-');
                if (!validKey)
                {
                    throw new InvalidDataException($"Bill #{bill.BillID} has an invalid idempotency key.");
                }
                if (!idempotencyKeys.Add($"{bill.BuyerID}:{bill.IdempotencyKey}"))
                {
                    throw new InvalidDataException($"Bill #{bill.BillID} has a duplicate idempotency key.");
                }
                if (bill.IdempotencyFingerprint.Length != 64
                    || !bill.IdempotencyFingerprint.All(char.IsAsciiHexDigit))
                {
                    throw new InvalidDataException($"Bill #{bill.BillID} has an invalid idempotency fingerprint.");
                }
            }
            else if (bill.IdempotencyFingerprint.Length > 0)
            {
                throw new InvalidDataException($"Bill #{bill.BillID} has an idempotency fingerprint without a key.");
            }
        }

        foreach (var detail in data.BillDetails)
        {
            if (!billIds.Contains(detail.BillID) || !productIds.Contains(detail.IDProduct))
            {
                throw new InvalidDataException($"BillDetail #{detail.BillDetailID} has a missing reference.");
            }
            if (detail.Quantity is < 1 or > 99
                || detail.Price is < 0 or > 1_000_000_000m
                || detail.Price != decimal.Truncate(detail.Price))
            {
                throw new InvalidDataException($"BillDetail #{detail.BillDetailID} has invalid quantity or price.");
            }
            if (string.IsNullOrWhiteSpace(detail.ProductName) || detail.ProductName.Length > 240 ||
                detail.Unit.Length > 30 || detail.Image_URL.Length > 500 ||
                detail.RegistrationNumber.Length > 80)
            {
                throw new InvalidDataException($"BillDetail #{detail.BillDetailID} has invalid snapshot metadata.");
            }
        }
        if (data.Bills.Any(bill => !data.BillDetails.Any(detail => detail.BillID == bill.BillID)))
        {
            throw new InvalidDataException("Every bill must contain at least one detail row.");
        }
    }

    private static void EnsureUniquePositiveIds<T>(
        IEnumerable<T> items,
        Func<T, int> selector,
        string label)
    {
        var ids = new HashSet<int>();
        foreach (var item in items)
        {
            var id = selector(item);
            if (id <= 0 || !ids.Add(id))
            {
                throw new InvalidDataException($"{label} contains a duplicate or non-positive ID ({id}).");
            }
        }
    }

    private static void ValidateAnnotations(object value, string label)
    {
        var results = new List<ValidationResult>();
        if (!Validator.TryValidateObject(value, new ValidationContext(value), results, true))
        {
            throw new InvalidDataException($"{label} is invalid: {string.Join(" ", results.Select(result => result.ErrorMessage))}");
        }
    }

    private static bool IsValidUsername(string? username)
    {
        var value = username?.Trim();
        return value is not null
            && value.Length is >= 3 and <= 60
            && value.All(character =>
                char.IsLetterOrDigit(character) ||
                character == '.' || character == '_' || character == '-');
    }

    private static bool IsPathWithin(string rootPath, string candidatePath)
    {
        var comparison = OperatingSystem.IsWindows()
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;
        var root = Path.TrimEndingDirectorySeparator(Path.GetFullPath(rootPath));
        var candidate = Path.GetFullPath(candidatePath);
        return candidate.Equals(root, comparison)
            || candidate.StartsWith(root + Path.DirectorySeparatorChar, comparison);
    }

    private static bool PathsEqual(string firstPath, string secondPath)
    {
        var comparison = OperatingSystem.IsWindows()
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;
        return Path.GetFullPath(firstPath).Equals(Path.GetFullPath(secondPath), comparison);
    }

    public static string NormalizeRole(string? role) => role?.Trim().ToLowerInvariant() switch
    {
        "admin" => "admin",
        "staff" => "staff",
        "buyer" => "buyer",
        null or "" => "buyer",
        _ => throw new InvalidDataException("Unknown user role in runtime data.")
    };

    public static string NormalizeStatus(string? status) => status?.Trim().ToLowerInvariant() switch
    {
        "processing" => "processing",
        "completed" => "completed",
        "cancelled" => "cancelled",
        "new" => "new",
        null or "" => "new",
        _ => throw new InvalidDataException("Unknown order status in runtime data.")
    };
}
