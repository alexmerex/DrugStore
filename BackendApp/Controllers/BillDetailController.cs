using BackendApp.Models;
using BackendApp.Services;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;

namespace BackendApp.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class BillDetailController : ControllerBase
    {
        // GET: api/BillDetail
        [HttpGet]
        public ActionResult<IEnumerable<BillDetail>> Get()
        {
            var billDetails = JsonDataService.ReadDataFromJsonFile<BillDetail>();
            return Ok(billDetails);
        }

        // GET: api/BillDetail/5
        [HttpGet("{id}", Name = "GetBillDetail")]
        public ActionResult<BillDetail> Get(int id)
        {
            var billDetails = JsonDataService.ReadDataFromJsonFile<BillDetail>();
            var billDetail = billDetails.Find(bd => bd.BillDetailID == id);
            if (billDetail == null)
            {
                return NotFound();
            }
            return Ok(billDetail);
        }

        // POST: api/BillDetail
        [HttpPost]
        public IActionResult Post([FromBody] BillDetail billDetail)
        {
            if (billDetail == null)
            {
                return BadRequest("BillDetail object is null");
            }

            var billDetails = JsonDataService.ReadDataFromJsonFile<BillDetail>();
            billDetail.BillDetailID = GenerateBillDetailId(billDetails);
            billDetails.Add(billDetail);
            JsonDataService.SaveDataToJsonFile(billDetails);

            return CreatedAtRoute("GetBillDetail", new { id = billDetail.BillDetailID }, billDetail);
        }

        // PUT: api/BillDetail/5
        [HttpPut("{id}")]
        public IActionResult Put(int id, [FromBody] BillDetail billDetail)
        {
            if (billDetail == null || id != billDetail.BillDetailID)
            {
                return BadRequest("BillDetail object is null or ID does not match");
            }

            var billDetails = JsonDataService.ReadDataFromJsonFile<BillDetail>();
            int index = billDetails.FindIndex(bd => bd.BillDetailID == id);
            if (index == -1)
            {
                return NotFound();
            }

            billDetails[index] = billDetail;
            JsonDataService.SaveDataToJsonFile(billDetails);

            return NoContent();
        }

        // DELETE: api/BillDetail/5
        [HttpDelete("{id}")]
        public IActionResult Delete(int id)
        {
            var billDetails = JsonDataService.ReadDataFromJsonFile<BillDetail>();
            int index = billDetails.FindIndex(bd => bd.BillDetailID == id);
            if (index == -1)
            {
                return NotFound();
            }

            billDetails.RemoveAt(index);
            JsonDataService.SaveDataToJsonFile(billDetails);

            return NoContent();
        }

        // Generate a new bill detail ID
        private int GenerateBillDetailId(List<BillDetail> billDetails)
        {
            // Example: Generate an ID based on the current list length + 1
            return billDetails.Count + 1;
        }
    }
}
