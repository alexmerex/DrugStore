namespace BackendApp.Models
{
    public class BillDetail
    {
        public int BillDetailID { get; set; }
        public int BillID { get; set; }
        public int IDProduct { get; set; }
        public int Quantity { get; set; }
        public decimal Price { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public string Unit { get; set; } = string.Empty;
        public string Image_URL { get; set; } = string.Empty;
        public string RegistrationNumber { get; set; } = string.Empty;
    }
}
