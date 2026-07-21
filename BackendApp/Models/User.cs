namespace BackendApp.Models
{
    public class User
    {
        public int UserID { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string Role { get; set; } = "buyer";
        public string Password { get; set; } = string.Empty;
    }
}
