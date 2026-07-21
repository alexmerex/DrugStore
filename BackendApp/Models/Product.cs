using System.ComponentModel.DataAnnotations;

namespace BackendApp.Models
{
    public class Product : IValidatableObject
    {
        public int IDProduct { get; set; }

        [Required(ErrorMessage = "Tên sản phẩm là bắt buộc.")]
        [StringLength(240, MinimumLength = 3, ErrorMessage = "Tên sản phẩm phải có từ 3 đến 240 ký tự.")]
        public string Name { get; set; } = string.Empty;

        [Range(1, int.MaxValue, ErrorMessage = "Danh mục không hợp lệ.")]
        public int ID_Category { get; set; }

        [Range(typeof(decimal), "0", "1000000000", ErrorMessage = "Giá sản phẩm phải từ 0 đến 1 tỷ đồng.")]
        public decimal Price { get; set; }

        [Required(ErrorMessage = "Đơn vị tính là bắt buộc.")]
        [StringLength(30)]
        public string Unit { get; set; } = string.Empty;

        [StringLength(100)]
        public string Type { get; set; } = string.Empty;

        [StringLength(100)]
        public string DosageForms { get; set; } = string.Empty;

        [StringLength(100)]
        public string Packing { get; set; } = string.Empty;

        [StringLength(100)]
        public string BrandOrigin { get; set; } = string.Empty;

        [StringLength(180)]
        public string Producer { get; set; } = string.Empty;

        [StringLength(100)]
        public string ManufacturingCountry { get; set; } = string.Empty;

        [StringLength(1200)]
        public string Ingredient { get; set; } = string.Empty;

        [StringLength(1200)]
        public string ShortDescription { get; set; } = string.Empty;

        [StringLength(80)]
        public string RegistrationNumber { get; set; } = string.Empty;

        [StringLength(500)]
        public string Image_URL { get; set; } = string.Empty;

        public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
        {
            if (Price != decimal.Truncate(Price))
            {
                yield return new ValidationResult(
                    "Giá sản phẩm phải là số nguyên đồng.",
                    [nameof(Price)]);
            }

            var normalizedName = Name?.Trim() ?? string.Empty;
            if (normalizedName.Length is < 3 or > 240)
            {
                yield return new ValidationResult(
                    "Tên sản phẩm phải có từ 3 đến 240 ký tự sau khi loại bỏ khoảng trắng thừa.",
                    [nameof(Name)]);
            }

            var value = Image_URL?.Trim() ?? string.Empty;
            if (value.Length == 0)
            {
                yield break;
            }

            var validLocalAsset = value.StartsWith("/assets/images/", StringComparison.Ordinal)
                && !value.Contains("..", StringComparison.Ordinal)
                && !value.Contains('\\')
                && !value.Contains('?')
                && !value.Contains('#')
                && !value.Contains('%');
            var validHttpsUrl = Uri.TryCreate(value, UriKind.Absolute, out var absoluteUri)
                && absoluteUri.Scheme == Uri.UriSchemeHttps;
            if (!validLocalAsset && !validHttpsUrl)
            {
                yield return new ValidationResult(
                    "Ảnh phải là URL HTTPS hoặc đường dẫn trong /assets/images/.",
                    [nameof(Image_URL)]);
            }
        }
    }
}
