using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using BackendApp.Models;

namespace BackendApp.Services
{
    public class UserService
    {
        private static UserService instance;
        private List<User> users;

        public UserService()
        {
            // Khởi tạo các thành viên và dữ liệu ở đây
            users = JsonDataService.ReadDataFromJsonFile<List<User>>().Cast<User>().ToList();
        }

        public static UserService Instance
        {
            get
            {
                if (instance == null)
                {
                    instance = new UserService();
                }
                return instance;
            }
        }

        public User GetUserById(int userId)
        {
            return users.FirstOrDefault(u => u.UserID == userId);
        }

        public List<User> GetAllUsers()
        {
            return users;
        }

        public void AddUser(User user)
        {
            if (user == null)
                throw new ArgumentNullException(nameof(user));

            user.UserID = GenerateUserId(); // Thay thế bằng logic tạo UserID
            users.Add(user);
            SaveChanges();
        }

        public void UpdateUser(User userToUpdate)
        {
            if (userToUpdate == null)
                throw new ArgumentNullException(nameof(userToUpdate));

            var existingUser = GetUserById(userToUpdate.UserID);
            if (existingUser != null)
            {
                // Cập nhật thông tin người dùng
                existingUser.UserName = userToUpdate.UserName;
                existingUser.Role = userToUpdate.Role;
                SaveChanges();
            }
        }

        public void DeleteUser(int userId)
        {
            var userToRemove = GetUserById(userId);
            if (userToRemove != null)
            {
                users.Remove(userToRemove);
                SaveChanges();
            }
        }

        private void SaveChanges()
        {
            JsonDataService.SaveDataToJsonFile(users);
        }

        private int GenerateUserId()
        {
            return users.Count > 0 ? users.Max(u => u.UserID) + 1 : 1;
        }
    }
}
