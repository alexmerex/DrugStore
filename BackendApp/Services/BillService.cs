using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using BackendApp.Models;

namespace BackendApp.Services
{
    public class BillService
    {
        private static BillService instance;
        private List<Bill> bills;

        public BillService()
        {
            bills = JsonDataService.ReadDataFromJsonFile<List<Bill>>().Cast<Bill>().ToList();
        }
        public static BillService Instance
        {
            get
            {
                if (instance == null)
                {
                    instance = new BillService();
                }
                return instance;
            }
        }

        public Bill GetBillById(int billId)
        {
            return bills.FirstOrDefault(b => b.BillID == billId);
        }

        public List<Bill> GetAllBills()
        {
            return bills;
        }

        public void AddBill(Bill bill)
        {
            if (bill == null)
                throw new ArgumentNullException(nameof(bill));

            bill.BillID = GenerateBillId(); // Thay thế bằng logic tạo BillID
            bills.Add(bill);
            SaveChanges();
        }

        public void UpdateBill(Bill billToUpdate)
        {
            if (billToUpdate == null)
                throw new ArgumentNullException(nameof(billToUpdate));

            var existingBill = GetBillById(billToUpdate.BillID);
            if (existingBill != null)
            {
                // Cập nhật thông tin hóa đơn
                existingBill.BuyerID = billToUpdate.BuyerID;
                existingBill.StaffID = billToUpdate.StaffID;
                existingBill.Discount = billToUpdate.Discount;
                existingBill.Tax = billToUpdate.Tax;
                existingBill.Date = billToUpdate.Date;
                existingBill.Total = billToUpdate.Total;
                SaveChanges();
            }
        }

        public void DeleteBill(int billId)
        {
            var billToRemove = GetBillById(billId);
            if (billToRemove != null)
            {
                bills.Remove(billToRemove);
                SaveChanges();
            }
        }

        private void SaveChanges()
        {
            JsonDataService.SaveDataToJsonFile(bills);
        }

        private int GenerateBillId()
        {
            return bills.Count > 0 ? bills.Max(b => b.BillID) + 1 : 1;
        }
    }
}
