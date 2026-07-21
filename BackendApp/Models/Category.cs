using System.ComponentModel.DataAnnotations;

namespace BackendApp.Models
{
    public class Category : IValidatableObject
    {
        public int ID_Category { get; set; }

        [Required(ErrorMessage = "Tên danh mục là bắt buộc.")]
        [StringLength(80, MinimumLength = 2, ErrorMessage = "Tên danh mục phải có từ 2 đến 80 ký tự.")]
        public string Name { get; set; } = string.Empty;

        public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
        {
            var normalizedName = Name?.Trim() ?? string.Empty;
            if (normalizedName.Length is < 2 or > 80)
            {
                yield return new ValidationResult(
                    "Tên danh mục phải có từ 2 đến 80 ký tự sau khi loại bỏ khoảng trắng thừa.",
                    [nameof(Name)]);
            }
        }
    }
}
