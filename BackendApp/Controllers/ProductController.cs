using BackendApp.Models;
using BackendApp.Services;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;

namespace BackendApp.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ProductController : ControllerBase
    {
        // GET: api/product
        [HttpGet]
        public ActionResult<IEnumerable<Product>> GetProducts()
        {
            var products = JsonDataService.ReadDataFromJsonFile<Product>();
            return Ok(products);
        }

        // GET: api/product/{id}
        [HttpGet("{id}")]
        public ActionResult<Product> GetProduct(int id)
        {
            var products = JsonDataService.ReadDataFromJsonFile<Product>();
            var product = products.Find(p => p.IDProduct == id);
            if (product == null)
            {
                return NotFound();
            }
            return Ok(product);
        }

        // POST: api/product
        [HttpPost]
        public IActionResult AddProduct(Product product)
        {
            var products = JsonDataService.ReadDataFromJsonFile<Product>();
            product.IDProduct = products.Count + 1; // Tạo ID mới cho sản phẩm

            products.Add(product);
            JsonDataService.SaveDataToJsonFile(products);

            return CreatedAtAction(nameof(GetProduct), new { id = product.IDProduct }, product);
        }

        // PUT: api/product/{id}
        [HttpPut("{id}")]
        public IActionResult UpdateProduct(int id, Product updatedProduct)
        {
            var products = JsonDataService.ReadDataFromJsonFile<Product>();
            var product = products.Find(p => p.IDProduct == id);
            if (product == null)
            {
                return NotFound();
            }

            product.Name = updatedProduct.Name;
            product.ID_Category = updatedProduct.ID_Category;
            product.Price = updatedProduct.Price;
            product.Unit = updatedProduct.Unit;
            product.Type = updatedProduct.Type;
            product.DosageForms = updatedProduct.DosageForms;
            product.Packing = updatedProduct.Packing;
            product.BrandOrigin = updatedProduct.BrandOrigin;
            product.Producer = updatedProduct.Producer;
            product.ManufacturingCountry = updatedProduct.ManufacturingCountry;
            product.Ingredient = updatedProduct.Ingredient;
            product.ShortDescription = updatedProduct.ShortDescription;
            product.RegistrationNumber = updatedProduct.RegistrationNumber;
            product.Image_URL = updatedProduct.Image_URL; // Sửa từ ImageURL thành Image_URL

            JsonDataService.SaveDataToJsonFile(products);

            return NoContent();
        }

        // DELETE: api/product/{id}
        [HttpDelete("{id}")]
        public IActionResult DeleteProduct(int id)
        {
            var products = JsonDataService.ReadDataFromJsonFile<Product>();
            var product = products.Find(p => p.IDProduct == id);
            if (product == null)
            {
                return NotFound();
            }

            products.Remove(product);
            JsonDataService.SaveDataToJsonFile(products);

            return NoContent();
        }

        // GET: api/product/{id}
        [HttpGet("limit10/{idCategory}")]
        public ActionResult<IEnumerable<object>> GetProductsByCategory(int idCategory, [FromQuery] int limit = 10)
        {
            var products = JsonDataService.ReadDataFromJsonFile<Product>();
            var categoryProducts = products
                .Where(p => p.ID_Category == idCategory)
                .Take(limit)
                .Select(p => new
                {
                    p.IDProduct,
                    p.Name,
                    p.ID_Category,
                    p.Price,
                    p.Unit,
                    p.Image_URL
                })
                .ToList();
            
            return Ok(categoryProducts);
        }
         [HttpGet("search")]
        public ActionResult<IEnumerable<Product>> SearchProductsByName(string name)
        {
            var products = JsonDataService.ReadDataFromJsonFile<Product>();
            var matchedProducts = products
                .Where(p => p.Name.Contains(name, StringComparison.OrdinalIgnoreCase))
                .ToList();

            if (!matchedProducts.Any())
            {
                return NotFound();
            }

            return Ok(matchedProducts);
        }
    }
}
