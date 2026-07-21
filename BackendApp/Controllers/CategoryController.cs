using BackendApp.Models;
using BackendApp.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BackendApp.Controllers;

[ApiController]
[Route("api/categories")]
public sealed class CategoryController : ControllerBase
{
    private readonly JsonDataStore _store;

    public CategoryController(JsonDataStore store) => _store = store;

    [AllowAnonymous]
    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken)
    {
        var categories = await _store.ReadAsync(data => data.Categories
            .OrderBy(category => category.ID_Category)
            .Select(category => new
            {
                category.ID_Category,
                category.Name,
                productCount = data.Products.Count(product => product.ID_Category == category.ID_Category)
            })
            .ToList(), cancellationToken);
        return Ok(categories);
    }

    [AllowAnonymous]
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id, CancellationToken cancellationToken)
    {
        var category = await _store.ReadAsync(data => data.Categories
            .Where(item => item.ID_Category == id)
            .Select(item => new
            {
                item.ID_Category,
                item.Name,
                productCount = data.Products.Count(product => product.ID_Category == item.ID_Category)
            })
            .FirstOrDefault(), cancellationToken);
        return category is null ? NotFound() : Ok(category);
    }

    [Authorize(Roles = "staff,admin")]
    [HttpPost]
    public async Task<IActionResult> Create(Category category, CancellationToken cancellationToken)
    {
        var result = await _store.WriteAsync(data =>
        {
            if (data.Categories.Any(item =>
                string.Equals(item.Name, category.Name.Trim(), StringComparison.OrdinalIgnoreCase)))
            {
                return (Category: (Category?)null, Duplicate: true);
            }

            category.ID_Category = JsonDataStore.NextId(data.Categories, item => item.ID_Category);
            data.Categories.Add(category);
            return (Category: category, Duplicate: false);
        }, cancellationToken);

        if (result.Duplicate || result.Category is null)
        {
            return Conflict(new ProblemDetails { Status = 409, Title = "Danh mục đã tồn tại." });
        }

        return CreatedAtAction(nameof(GetById), new { id = result.Category.ID_Category }, result.Category);
    }

    [Authorize(Roles = "staff,admin")]
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(
        int id,
        Category updated,
        CancellationToken cancellationToken)
    {
        var result = await _store.WriteAsync(data =>
        {
            var category = data.Categories.FirstOrDefault(item => item.ID_Category == id);
            if (category is null)
            {
                return UpdateCategoryResult.NotFound;
            }

            if (data.Categories.Any(item => item.ID_Category != id &&
                string.Equals(item.Name, updated.Name.Trim(), StringComparison.OrdinalIgnoreCase)))
            {
                return UpdateCategoryResult.Duplicate;
            }

            category.Name = updated.Name;
            return UpdateCategoryResult.Success;
        }, cancellationToken);

        return result switch
        {
            UpdateCategoryResult.NotFound => NotFound(),
            UpdateCategoryResult.Duplicate => Conflict(new ProblemDetails
            {
                Status = 409,
                Title = "Danh mục đã tồn tại."
            }),
            _ => NoContent()
        };
    }

    [Authorize(Roles = "staff,admin")]
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var result = await _store.WriteAsync(data =>
        {
            var category = data.Categories.FirstOrDefault(item => item.ID_Category == id);
            if (category is null)
            {
                return DeleteCategoryResult.NotFound;
            }

            if (data.Products.Any(product => product.ID_Category == id))
            {
                return DeleteCategoryResult.Referenced;
            }

            data.Categories.Remove(category);
            return DeleteCategoryResult.Success;
        }, cancellationToken);

        return result switch
        {
            DeleteCategoryResult.NotFound => NotFound(),
            DeleteCategoryResult.Referenced => Conflict(new ProblemDetails
            {
                Status = 409,
                Title = "Danh mục đang chứa sản phẩm nên không thể xóa."
            }),
            _ => NoContent()
        };
    }

    private enum UpdateCategoryResult { Success, NotFound, Duplicate }
    private enum DeleteCategoryResult { Success, NotFound, Referenced }
}
