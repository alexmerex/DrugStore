using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.IO;

namespace BackendApp.Services
{
    public static class JsonDataService
    {
        private static readonly string JsonFilePath = "database.json";

        public static List<T> ReadDataFromJsonFile<T>()
        {
            try
            {
                using (StreamReader r = new StreamReader(JsonFilePath))
                {
                    string json = r.ReadToEnd();
                    var data = JsonConvert.DeserializeObject<Dictionary<string, List<T>>>(json);
                    if (data.TryGetValue(typeof(T).Name, out List<T> result))
                    {
                        return result;
                    }
                    else
                    {
                        return new List<T>();
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error reading JSON file: {ex.Message}");
                return new List<T>();
            }
        }

        public static void SaveDataToJsonFile<T>(List<T> data)
        {
            try
            {
                var jsonData = File.ReadAllText(JsonFilePath);
                var allData = JsonConvert.DeserializeObject<Dictionary<string, object>>(jsonData);
                allData[typeof(T).Name] = data;
                jsonData = JsonConvert.SerializeObject(allData, Formatting.Indented);
                File.WriteAllText(JsonFilePath, jsonData);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error saving JSON file: {ex.Message}");
            }
        }
    }
}
