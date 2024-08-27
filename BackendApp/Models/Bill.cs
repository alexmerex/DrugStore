namespace BackendApp.Models
{
    public class Bill
    {
        public int BillID { get; set; }
        public int BuyerID { get; set; }
        public int StaffID { get; set; }
        public decimal Discount { get; set; }
        public decimal Tax { get; set; }
        public DateTime Date { get; set; }
        public decimal Total { get; set; }
    }
}
