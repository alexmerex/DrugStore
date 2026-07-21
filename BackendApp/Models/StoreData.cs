using System.Text.Json.Serialization;

namespace BackendApp.Models;

public sealed class StoreData
{
    [JsonPropertyName("User")]
    public List<User> Users { get; set; } = [];

    [JsonPropertyName("Category")]
    public List<Category> Categories { get; set; } = [];

    [JsonPropertyName("Product")]
    public List<Product> Products { get; set; } = [];

    [JsonPropertyName("Bill")]
    public List<Bill> Bills { get; set; } = [];

    [JsonPropertyName("BillDetail")]
    public List<BillDetail> BillDetails { get; set; } = [];
}
