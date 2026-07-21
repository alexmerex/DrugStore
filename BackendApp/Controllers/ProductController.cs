using BackendApp.Models;
using BackendApp.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BackendApp.Controllers;

[ApiController]
[Route("api/products")]
public sealed class ProductController : ControllerBase
{
    private readonly JsonDataStore _store;

    public ProductController(JsonDataStore store) => _store = store;

    [AllowAnonymous]
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<Product>>> GetAll(
        [FromQuery] string? search,
        [FromQuery] int? categoryId,
        [FromQuery] int limit = 100,
        CancellationToken cancellationToken = default)
    {
        limit = Math.Clamp(limit, 1, 200);
        search = search?.Trim();

        var products = await _store.ReadAsync(data => data.Products
            .Where(product => !categoryId.HasValue || product.ID_Category == categoryId.Value)
            .Where(product => string.IsNullOrWhiteSpace(search) ||
                product.Name.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                product.Type.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                product.Ingredient.Contains(search, StringComparison.OrdinalIgnoreCase))
            .OrderBy(product => product.Name)
            .Take(limit)
            .ToList(), cancellationToken);

        return Ok(products);
    }

    [AllowAnonymous]
    [HttpGet("{id:int}")]
    public async Task<ActionResult<Product>> GetById(int id, CancellationToken cancellationToken)
    {
        var product = await _store.ReadAsync(
            data => data.Products.FirstOrDefault(item => item.IDProduct == id),
            cancellationToken);
        return product is null ? NotFound() : Ok(product);
    }

    [Authorize(Roles = "staff,admin")]
    [HttpPost]
    public async Task<IActionResult> Create(Product product, CancellationToken cancellationToken)
    {
        var result = await _store.WriteAsync(data =>
        {
            if (!data.Categories.Any(category => category.ID_Category == product.ID_Category))
            {
                return (Product: (Product?)null, MissingCategory: true);
            }

            product.IDProduct = JsonDataStore.NextId(data.Products, item => item.IDProduct);
            data.Products.Add(product);
            return (Product: product, MissingCategory: false);
        }, cancellationToken);

        if (result.MissingCategory || result.Product is null)
        {
            ModelState.AddModelError(nameof(product.ID_Category), "Danh mục không tồn tại.");
            return ValidationProblem(ModelState);
        }

        return CreatedAtAction(nameof(GetById), new { id = result.Product.IDProduct }, result.Product);
    }

    [Authorize(Roles = "staff,admin")]
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, Product updated, CancellationToken cancellationToken)
    {
        var result = await _store.WriteAsync(data =>
        {
            var product = data.Products.FirstOrDefault(item => item.IDProduct == id);
            if (product is null)
            {
                return UpdateProductResult.NotFound;
            }

            if (!data.Categories.Any(category => category.ID_Category == updated.ID_Category))
            {
                return UpdateProductResult.MissingCategory;
            }

            product.Name = updated.Name;
            product.ID_Category = updated.ID_Category;
            product.Price = updated.Price;
            product.Unit = updated.Unit;
            product.Type = updated.Type;
            product.DosageForms = updated.DosageForms;
            product.Packing = updated.Packing;
            product.BrandOrigin = updated.BrandOrigin;
            product.Producer = updated.Producer;
            product.ManufacturingCountry = updated.ManufacturingCountry;
            product.Ingredient = updated.Ingredient;
            product.ShortDescription = updated.ShortDescription;
            product.RegistrationNumber = updated.RegistrationNumber;
            product.Image_URL = updated.Image_URL;
            return UpdateProductResult.Success;
        }, cancellationToken);

        return result switch
        {
            UpdateProductResult.NotFound => NotFound(),
            UpdateProductResult.MissingCategory => BadRequest(new ProblemDetails
            {
                Status = 400,
                Title = "Danh mục không tồn tại."
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
            var product = data.Products.FirstOrDefault(item => item.IDProduct == id);
            if (product is null)
            {
                return DeleteProductResult.NotFound;
            }

            if (data.BillDetails.Any(detail => detail.IDProduct == id))
            {
                return DeleteProductResult.Referenced;
            }

            data.Products.Remove(product);
            return DeleteProductResult.Success;
        }, cancellationToken);

        return result switch
        {
            DeleteProductResult.NotFound => NotFound(),
            DeleteProductResult.Referenced => Conflict(new ProblemDetails
            {
                Status = 409,
                Title = "Sản phẩm đã phát sinh đơn hàng nên không thể xóa."
            }),
            _ => NoContent()
        };
    }

    private enum UpdateProductResult { Success, NotFound, MissingCategory }
    private enum DeleteProductResult { Success, NotFound, Referenced }
}
