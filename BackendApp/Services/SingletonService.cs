using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using BackendApp.Models;

namespace BackendApp.Services
{
    public class SingletonService
    {
        private static SingletonService instance;

        // Các dịch vụ cần sử dụng
        public UserService UserService { get; private set; }
        public ProductService ProductService { get; private set; }
        public BillService BillService { get; private set; }
        public BillDetailService BillDetailService { get; private set; }
        public CategoryService CategoryService { get; private set; }

        private SingletonService()
        {
            // Khởi tạo các dịch vụ
            UserService = new UserService();
            ProductService = new ProductService();
            BillService = new BillService();
            BillDetailService = new BillDetailService();
            CategoryService = new CategoryService();
            // Khởi tạo các dịch vụ khác nếu có
        }

        public static SingletonService GetInstance()
        {
            if (instance == null)
            {
                instance = new SingletonService();
                // Khởi tạo các tài nguyên khác cần thiết ở đây nếu có
            }
            return instance;
        }
    }
}

