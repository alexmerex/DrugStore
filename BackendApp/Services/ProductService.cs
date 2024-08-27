using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using BackendApp.Models;

namespace BackendApp.Services
{
    public class ProductService
    {
        private static ProductService instance;
        private List<Product> products;

        public ProductService()
        {
            products = JsonDataService.ReadDataFromJsonFile<List<Product>>().Cast<Product>().ToList();
            if (products == null)
            {
                products = new List<Product>(); // Khởi tạo danh sách nếu chưa có dữ liệu từ file JSON
            }
        }
        public static ProductService Instance
        {
            get
            {
                if (instance == null)
                {
                    instance = new ProductService();
                }
                return instance;
            }
        }

        public Product GetProductById(int productId)
        {
            return products.FirstOrDefault(p => p.IDProduct == productId);
        }

        public List<Product> GetAllProducts()
        {
            return products;
        }

        public void AddProduct(Product product)
        {
            if (product == null)
                throw new ArgumentNullException(nameof(product));

            product.IDProduct = GenerateProductId(); // Thay thế bằng logic tạo IDProduct
            products.Add(product);
            SaveChanges();
        }

        public void UpdateProduct(Product productToUpdate)
        {
            if (productToUpdate == null)
                throw new ArgumentNullException(nameof(productToUpdate));

            var existingProduct = GetProductById(productToUpdate.IDProduct);
            if (existingProduct != null)
            {
                // Cập nhật thông tin sản phẩm
                existingProduct.Name = productToUpdate.Name;
                existingProduct.ID_Category = productToUpdate.ID_Category;
                existingProduct.Price = productToUpdate.Price;
                existingProduct.Unit = productToUpdate.Unit;
                existingProduct.Type = productToUpdate.Type;
                existingProduct.ShortDescription = productToUpdate.ShortDescription;
                SaveChanges();
            }
        }

        public void DeleteProduct(int productId)
        {
            var productToRemove = GetProductById(productId);
            if (productToRemove != null)
            {
                products.Remove(productToRemove);
                SaveChanges();
            }
        }

        private void SaveChanges()
        {
            JsonDataService.SaveDataToJsonFile(products);
        }

        private int GenerateProductId()
        {
            return products.Count > 0 ? products.Max(p => p.IDProduct) + 1 : 1;
        }
    }
}
