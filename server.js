const express = require('express');
const sql = require('mssql');
const app = express();
const port = 3000;

// Cấu hình kết nối đến cơ sở dữ liệu SQL Server sử dụng Windows Authentication
const config = {
    authentication: {
        type: 'default',
        options: {
            userName: 'minh\\Minh', // Thay đổi tên người dùng nếu cần
            password: '', // Thay đổi mật khẩu nếu cần
        }
    },
    server: 'localhost',
    database: 'NhaThuoc',
    options: {
        encrypt: false, // Nếu bạn sử dụng SQL Server Express, hãy đặt giá trị này thành false
        enableArithAbort: true // Đảm bảo rằng tùy chọn này được đặt thành true để tránh lỗi ArithAbort
    }
};

// Kết nối đến cơ sở dữ liệu SQL Server
sql.connect(config, err => {
    if (err) {
        console.error('Lỗi kết nối đến cơ sở dữ liệu:', err);
        return;
    }
    console.log('Đã kết nối đến cơ sở dữ liệu SQL Server');
});

// Endpoint để lấy danh sách tất cả các loại thuốc
app.get('/medicines', (req, res) => {
    const request = new sql.Request();
    request.query('SELECT * FROM NhaThuoc', (err, result) => {
        if (err) {
            console.error('Lỗi truy vấn cơ sở dữ liệu:', err);
            res.status(500).send(err);
            return;
        }
        res.json(result.recordset);
    });
});

// Endpoint để thêm mới một loại thuốc
app.post('/medicines', (req, res) => {
    const { name, description } = req.body; // Giả sử bạn muốn thêm thuốc với tên và mô tả
    const request = new sql.Request();
    request.query(`INSERT INTO NhaThuoc (Name, Description) VALUES ('${name}', '${description}')`, (err, result) => {
        if (err) {
            console.error('Lỗi thêm mới loại thuốc:', err);
            res.status(500).send(err);
            return;
        }
        res.send('Đã thêm mới loại thuốc thành công');
    });
});

// Lắng nghe trên cổng đã chỉ định
app.listen(port, () => {
    console.log(`Server đang chạy tại http://localhost:${port}`);
});
