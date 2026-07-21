using System.Security.Cryptography;

namespace BackendApp.Services;

public sealed class PasswordService
{
    private const string Algorithm = "pbkdf2-sha256";
    private const int Iterations = 120_000;
    private const int SaltSize = 16;
    private const int KeySize = 32;

    public string Hash(string password)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(password);

        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var key = Rfc2898DeriveBytes.Pbkdf2(
            password,
            salt,
            Iterations,
            HashAlgorithmName.SHA256,
            KeySize);

        return string.Join('$', Algorithm, Iterations, Convert.ToBase64String(salt), Convert.ToBase64String(key));
    }

    public bool Verify(string password, string storedValue)
    {
        if (string.IsNullOrEmpty(password) || string.IsNullOrEmpty(storedValue))
        {
            return false;
        }

        // Backward compatibility for the original seed. InitializeAsync migrates
        // these values immediately, but this keeps login safe during a partial upgrade.
        if (!IsHash(storedValue))
        {
            return CryptographicOperations.FixedTimeEquals(
                System.Text.Encoding.UTF8.GetBytes(password),
                System.Text.Encoding.UTF8.GetBytes(storedValue));
        }

        if (!TryReadHash(storedValue, out var iterations, out var salt, out var expected))
        {
            return false;
        }

        var actual = Rfc2898DeriveBytes.Pbkdf2(
            password,
            salt,
            iterations,
            HashAlgorithmName.SHA256,
            expected.Length);

        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }

    public bool IsHash(string? value)
        => value?.StartsWith($"{Algorithm}$", StringComparison.Ordinal) == true;

    public bool IsWellFormedHash(string? value)
        => value is not null && TryReadHash(value, out _, out _, out _);

    private static bool TryReadHash(
        string storedValue,
        out int iterations,
        out byte[] salt,
        out byte[] expected)
    {
        iterations = 0;
        salt = [];
        expected = [];

        var parts = storedValue.Split('$');
        if (parts.Length != 4 ||
            parts[0] != Algorithm ||
            !int.TryParse(parts[1], out iterations) ||
            iterations is < 10_000 or > 1_000_000)
        {
            return false;
        }

        try
        {
            salt = Convert.FromBase64String(parts[2]);
            expected = Convert.FromBase64String(parts[3]);
            return salt.Length is >= 8 and <= 64 && expected.Length is >= 16 and <= 64;
        }
        catch (FormatException)
        {
            salt = [];
            expected = [];
            return false;
        }
    }
}
