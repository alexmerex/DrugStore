namespace BackendApp.Models
{
    public class BillDetail
    {
        public int BillDetailID { get; set; }
        public int BillID { get; set; }
        public int IDProduct { get; set; }
        public int Quantity { get; set; }
        public decimal Price { get; set; }
    }
}
