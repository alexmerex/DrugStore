using BackendApp.Models;
using BackendApp.Services;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;

namespace BackendApp.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class BillController : ControllerBase
    {
        // GET: api/Bill
        [HttpGet]
        public ActionResult<IEnumerable<Bill>> Get()
        {
            var bills = JsonDataService.ReadDataFromJsonFile<Bill>();
            return Ok(bills);
        }

        // GET: api/Bill/5
        [HttpGet("{id}", Name = "GetBill")]
        public ActionResult<Bill> Get(int id)
        {
            var bills = JsonDataService.ReadDataFromJsonFile<Bill>();
            var bill = bills.Find(b => b.BillID == id);
            if (bill == null)
            {
                return NotFound();
            }
            return Ok(bill);
        }

        // POST: api/Bill
        [HttpPost]
        public IActionResult Post([FromBody] Bill bill)
        {
            if (bill == null)
            {
                return BadRequest("Bill object is null");
            }

            var bills = JsonDataService.ReadDataFromJsonFile<Bill>();
            bill.BillID = GenerateBillId(bills);
            bills.Add(bill);
            JsonDataService.SaveDataToJsonFile(bills);

            return CreatedAtRoute("GetBill", new { id = bill.BillID }, bill);
        }

        // PUT: api/Bill/5
        [HttpPut("{id}")]
        public IActionResult Put(int id, [FromBody] Bill bill)
        {
            if (bill == null || id != bill.BillID)
            {
                return BadRequest("Bill object is null or ID does not match");
            }

            var bills = JsonDataService.ReadDataFromJsonFile<Bill>();
            int index = bills.FindIndex(b => b.BillID == id);
            if (index == -1)
            {
                return NotFound();
            }

            bills[index] = bill;
            JsonDataService.SaveDataToJsonFile(bills);

            return NoContent();
        }

        // DELETE: api/Bill/5
        [HttpDelete("{id}")]
        public IActionResult Delete(int id)
        {
            var bills = JsonDataService.ReadDataFromJsonFile<Bill>();
            int index = bills.FindIndex(b => b.BillID == id);
            if (index == -1)
            {
                return NotFound();
            }

            bills.RemoveAt(index);
            JsonDataService.SaveDataToJsonFile(bills);

            return NoContent();
        }

        // Generate a new bill ID
        private int GenerateBillId(List<Bill> bills)
        {
            // Example: Generate an ID based on the current list length + 1
            return bills.Count + 1;
        }
    }
}
