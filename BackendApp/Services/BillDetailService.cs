using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using BackendApp.Models;

namespace BackendApp.Services
{
    public class BillDetailService
    {
        private static BillDetailService instance;
        private List<BillDetail> billDetails;

        public BillDetailService()
        {
            billDetails = JsonDataService.ReadDataFromJsonFile<List<BillDetail>>().Cast<BillDetail>().ToList();
        }
        public static BillDetailService Instance
        {
            get
            {
                if (instance == null)
                {
                    instance = new BillDetailService();
                }
                return instance;
            }
        }

        public List<BillDetail> GetBillDetailsByBillId(int billId)
        {
            return billDetails.Where(bd => bd.BillID == billId).ToList();
        }

        public void AddBillDetail(BillDetail billDetail)
        {
            if (billDetail == null)
                throw new ArgumentNullException(nameof(billDetail));

            billDetail.BillDetailID = GenerateBillDetailId(); // Thay thế bằng logic tạo BillDetailID
            billDetails.Add(billDetail);
            SaveChanges();
        }

        public void UpdateBillDetail(BillDetail billDetailToUpdate)
        {
            if (billDetailToUpdate == null)
                throw new ArgumentNullException(nameof(billDetailToUpdate));

            var existingBillDetail = billDetails.FirstOrDefault(bd => bd.BillDetailID == billDetailToUpdate.BillDetailID);
            if (existingBillDetail != null)
            {
                // Cập nhật thông tin chi tiết hóa đơn
                existingBillDetail.BillID = billDetailToUpdate.BillID;
                existingBillDetail.IDProduct = billDetailToUpdate.IDProduct;
                existingBillDetail.Quantity = billDetailToUpdate.Quantity;
                existingBillDetail.Price = billDetailToUpdate.Price;
                SaveChanges();
            }
        }

        public void DeleteBillDetail(int billDetailId)
        {
            var billDetailToRemove = billDetails.FirstOrDefault(bd => bd.BillDetailID == billDetailId);
            if (billDetailToRemove != null)
            {
                billDetails.Remove(billDetailToRemove);
                SaveChanges();
            }
        }

        private void SaveChanges()
        {
            JsonDataService.SaveDataToJsonFile(billDetails);
        }

        private int GenerateBillDetailId()
        {
            return billDetails.Count > 0 ? billDetails.Max(bd => bd.BillDetailID) + 1 : 1;
        }
    }
}
