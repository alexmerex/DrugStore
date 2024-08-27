using BackendApp.Models;
using BackendApp.Services;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;

namespace BackendApp.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class CategoryController : ControllerBase
    {
        // GET: api/Category
        [HttpGet]
        public ActionResult<IEnumerable<Category>> Get()
        {
            var categories = JsonDataService.ReadDataFromJsonFile<Category>();
            return Ok(categories);
        }

        // GET: api/Category/5
        [HttpGet("{id}", Name = "GetCategory")]
        public ActionResult<Category> Get(int id)
        {
            var categories = JsonDataService.ReadDataFromJsonFile<Category>();
            var category = categories.Find(c => c.ID_Category == id);
            if (category == null)
            {
                return NotFound();
            }
            return Ok(category);
        }

        // POST: api/Category
        [HttpPost]
        public IActionResult Post([FromBody] Category category)
        {
            if (category == null)
            {
                return BadRequest("Category object is null");
            }

            var categories = JsonDataService.ReadDataFromJsonFile<Category>();
            category.ID_Category = GenerateCategoryId(categories);
            categories.Add(category);
            JsonDataService.SaveDataToJsonFile(categories);

            return CreatedAtRoute("GetCategory", new { id = category.ID_Category }, category);
        }

        // PUT: api/Category/5
        [HttpPut("{id}")]
        public IActionResult Put(int id, [FromBody] Category category)
        {
            if (category == null || id != category.ID_Category)
            {
                return BadRequest("Category object is null or ID does not match");
            }

            var categories = JsonDataService.ReadDataFromJsonFile<Category>();
            int index = categories.FindIndex(c => c.ID_Category == id);
            if (index == -1)
            {
                return NotFound();
            }

            categories[index] = category;
            JsonDataService.SaveDataToJsonFile(categories);

            return NoContent();
        }

        // DELETE: api/Category/5
        [HttpDelete("{id}")]
        public IActionResult Delete(int id)
        {
            var categories = JsonDataService.ReadDataFromJsonFile<Category>();
            int index = categories.FindIndex(c => c.ID_Category == id);
            if (index == -1)
            {
                return NotFound();
            }

            categories.RemoveAt(index);
            JsonDataService.SaveDataToJsonFile(categories);

            return NoContent();
        }

        // Generate a new category ID
        private int GenerateCategoryId(List<Category> categories)
        {
            // Example: Generate an ID based on the current list length + 1
            return categories.Count + 1;
        }
    }
}
