using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using BackendApp.Models;

namespace BackendApp.Services
{
    public class CategoryService
    {
        private static CategoryService instance;
        private List<Category> categories;

        public CategoryService()
        {
            categories = JsonDataService.ReadDataFromJsonFile<List<Category>>().Cast<Category>().ToList();
        }
        public static CategoryService Instance
        {
            get
            {
                if (instance == null)
                {
                    instance = new CategoryService();
                }
                return instance;
            }
        }

        public Category GetCategoryById(int categoryId)
        {
            return categories.FirstOrDefault(c => c.ID_Category == categoryId);
        }

        public List<Category> GetAllCategories()
        {
            return categories;
        }

        public void AddCategory(Category category)
        {
            if (category == null)
                throw new ArgumentNullException(nameof(category));

            category.ID_Category = GenerateCategoryId(); // Thay thế bằng logic tạo ID_Category
            categories.Add(category);
            SaveChanges();
        }

        public void UpdateCategory(Category categoryToUpdate)
        {
            if (categoryToUpdate == null)
                throw new ArgumentNullException(nameof(categoryToUpdate));

            var existingCategory = GetCategoryById(categoryToUpdate.ID_Category);
            if (existingCategory != null)
            {
                // Cập nhật thông tin danh mục sản phẩm
                existingCategory.Name = categoryToUpdate.Name;
                SaveChanges();
            }
        }

        public void DeleteCategory(int categoryId)
        {
            var categoryToRemove = GetCategoryById(categoryId);
            if (categoryToRemove != null)
            {
                categories.Remove(categoryToRemove);
                SaveChanges();
            }
        }

        private void SaveChanges()
        {
            JsonDataService.SaveDataToJsonFile(categories);
        }

        private int GenerateCategoryId()
        {
            return categories.Count > 0 ? categories.Max(c => c.ID_Category) + 1 : 1;
        }
    }
}
