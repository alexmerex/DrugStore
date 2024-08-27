namespace BackendApp.Models
{
    public class Product
    {
        public int IDProduct { get; set; }
        public string Name { get; set; }
        public int ID_Category { get; set; }
        public decimal Price { get; set; }
        public string Unit { get; set; }
        public string Type { get; set; }
        public string DosageForms { get; set; }
        public string Packing { get; set; }
        public string BrandOrigin { get; set; }
        public string Producer { get; set; }
        public string ManufacturingCountry { get; set; }
        public string Ingredient { get; set; }
        public string ShortDescription { get; set; }
        public string RegistrationNumber { get; set; }
        public string Image_URL { get; set; }
    }
}
