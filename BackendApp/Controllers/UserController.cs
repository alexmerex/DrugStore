using BackendApp.Models;
using BackendApp.Services;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;

namespace BackendApp.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class UserController : ControllerBase
    {
        private readonly List<User> users;
        private static int userCount;

        public UserController()
        {
            users = JsonDataService.ReadDataFromJsonFile<User>();
        }

        // GET: api/user (lấy tất cả người dùng)
        [HttpGet]
        public ActionResult<List<User>> GetAllUsers()
        {
            return Ok(users);
        }

        // GET: api/user/5 (lấy người dùng theo ID)
        [HttpGet("{id}")]
        public ActionResult<User> GetUserById(int id)
        {
            var user = users.Find(u => u.UserID == id);
            if (user == null)
            {
                return NotFound();
            }
            return Ok(user);
        }

        // POST: api/user (thêm người dùng mới)
        [HttpPost]
        public ActionResult<User> AddUser(User user)
        {
            user.Password = HashPassword(user.Password);
            users.Add(user);
            JsonDataService.SaveDataToJsonFile(users);
            return CreatedAtAction(nameof(GetUserById), new { id = user.UserID }, user);
        }

        // PUT: api/user/5 (cập nhật thông tin người dùng)
        [HttpPut("{id}")]
        public ActionResult UpdateUser(int id, User userToUpdate)
        {
            if (id != userToUpdate.UserID)
            {
                return BadRequest();
            }

            var index = users.FindIndex(u => u.UserID == id);
            if (index == -1)
            {
                return NotFound();
            }

            userToUpdate.Password = HashPassword(userToUpdate.Password);
            users[index] = userToUpdate;
            JsonDataService.SaveDataToJsonFile(users);
            return NoContent();
        }

        // DELETE: api/user/5 (xóa người dùng)
        [HttpDelete("{id}")]
        public ActionResult DeleteUser(int id)
        {
            var userToRemove = users.Find(u => u.UserID == id);
            if (userToRemove == null)
            {
                return NotFound();
            }

            users.Remove(userToRemove);
            JsonDataService.SaveDataToJsonFile(users);
            return NoContent();
        }

        // POST: api/user/login (đăng nhập)
        [HttpPost("login")]
        public ActionResult Login([FromBody] LoginRequest loginRequest)
        {
            var user = users.FirstOrDefault(u => u.UserName == loginRequest.Username && u.Password == loginRequest.Password);
            if (user == null)
            {
                return Unauthorized();
            }

            // Return user information or token
            var userInfo = new
            {
                UserID = user.UserID,
                Username = user.UserName,
                Role = user.Role // Include role in response
            };

            return Ok(userInfo);
        }

        private int CountUsers()
        {
            return users.Count;
        }

        [HttpPost("register")]
        public ActionResult Register([FromBody] User user)
        {
            if (users.Any(u => u.UserName == user.UserName))
            {
                return BadRequest("Username already exists");
            }
            var userCount = CountUsers();
            userCount++; // Tăng userCount lên 1 để tính UserID cho người dùng mới
            user.UserID = userCount; // Đặt UserID cho người dùng mới
            user.Role = "buyer"; // Thiết lập role mặc định là buyer
            users.Add(user);
            JsonDataService.SaveDataToJsonFile(users);
            var userInfo = new
            {
                UserID = user.UserID,
                Username = user.UserName,
                Password = user.Password,
                Role = user.Role // Include role in response
            };
            return Ok(userInfo);
        }

        private string HashPassword(string password)
        {
            using (var sha256 = SHA256.Create())
            {
                var bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(password));
                var builder = new StringBuilder();
                for (var i = 0; i < bytes.Length; i++)
                {
                    builder.Append(bytes[i].ToString("x2"));
                }
                return builder.ToString();
            }
        }

        private bool VerifyPassword(string inputPassword, string storedHash)
        {
            var hashInput = HashPassword(inputPassword);
            return hashInput == storedHash;
        }


        public class LoginRequest
        {
            public string Username { get; set; }
            public string Password { get; set; }
        }
    }
}
