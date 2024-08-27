-- Bảng User
CREATE TABLE User (
    UserID INT PRIMARY KEY,
    UserName varchar(500) NOT NULL,
    Name NVARCHAR(500) NOT NULL,
    Phone VARCHAR(10) NOT NULL,
    Address NVARCHAR(100) NOT NULL,
    Gender CHAR(1) CHECK (Gender IN ('M', 'F')),
    Role VARCHAR(30) NOT NULL
);

-- Bảng Product
CREATE TABLE Product (
    IDProduct INT PRIMARY KEY,
    Name NVARCHAR(100),
    ID_Category INT FOREIGN KEY REFERENCES Category(ID_Category),
    Price DECIMAL(10,2) NULL,
    Unit NVARCHAR(20)  NULL,
    Type NVARCHAR(50)  NULL,
    [Dosage forms] NVARCHAR(50) NULL,
    Packing NVARCHAR(50) NULL,
    [Brand origin] NVARCHAR(50) NULL,
    Producer NVARCHAR(100) NULL,
    [Manufacturing country] NVARCHAR(50) NULL,
    Ingredient NVARCHAR(500) NULL,
    [Short description] NVARCHAR(500) NULL,
    [Registration number] NVARCHAR(50) NULL,
    Image_URL NVARCHAR(200) NULL
);

-- Bảng Category
CREATE TABLE Category (
    ID_Category INT PRIMARY KEY,
    Name NVARCHAR(50) NOT NULL
);

-- Bảng Order
CREATE TABLE [Order] (
    IDOrder INT PRIMARY KEY,
    UserID INT FOREIGN KEY REFERENCES User(UserID),
    [Total amount] DECIMAL(10,2) NOT NULL,
    [Export date] DATE NOT NULL
);

-- Bảng OrderDetail
CREATE TABLE OrderDetail (
    ID_OD INT PRIMARY KEY,
    IDOrder INT FOREIGN KEY REFERENCES [Order](IDOrder),
    IDProduct INT FOREIGN KEY REFERENCES Product(IDProduct),
    Quantity INT NOT NULL,
    Price DECIMAL(10,2) NOT NULL
);

INSERT INTO User (UserID, UserName, Name, Phone, Address, Gender, Role) VALUES
(1, 'user1', N'Nguyễn Văn A', '0987654321', N'Hà Nội', 'M', 'buyer'),
(2, 'user2', N'Nguyễn Thị B', '0123456789', N'Hồ Chí Minh', 'F', 'staff');

INSERT INTO Category (ID_Category, Name) VALUES
(1, N'Thực phẩm chức năng'),
(2, N'Dược mỹ phẩm'),
(3, N'Chăm sóc cá nhân');

INSERT INTO Product (IDProduct, Name, ID_Category, Price, Unit, Type, [Dosage forms], Packing, [Brand origin], Producer, [Manufacturing country], Ingredient, [Short description], [Registration number], Image_URL)
VALUES
(1, N'Viên uống Precare Mama Diamond cung cấp các vitamin khoáng chất cho phụ nữ mang thai (30 viên)', 1, 185000, N'Hộp', N'Vitamin & Khoáng chất', N'Viên nang mềm', N'Hộp 30 Viên', N'Việt Nam', N'CÔNG TY DƯỢC PHẨM VÀ THƯƠNG MẠI THÀNH CÔNG - TNHH', N'Việt Nam', N'DHA EPA L-Carnitine Calci from milk Kẽm oxide Lysine HCl Sắt fumarate Phốt pho Magie oxide Vitamin B3 Vitamin B5 Vitamin E Vitamin B1 Vitamin B2 Vitamin B6 Axit Folic Đồng sulfate Mangan sulfate Vitamin A Vitamin D3 KIO3 Vitamin H Vitamin K2 (015%) Selen (2‰)', N'Precare Mama Diamond bổ sung DHA EPA các vitamin khoáng chất và acid amin cho phụ nữ mang thai và trong thời kỳ cho con bú. Duy trì sức khỏe nâng cao sức đề kháng cho bà mẹ.', N'10347/2019/ÐKSP', N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/DSC_09581_5712979ba0.jpg'),
(2, N'Viên sủi Kudos Bone hương cam bổ sung canxi vitamin K2 vitamin D3 cho cơ thể (20 viên)', 1, 90400, N'Tuýp', N'Vitamin & Khoáng chất', N'Viên sủi', N'Tuýp 20 Viên', N'Singapore', N'SANOTACT GMBH', N'Đức', N'Calci carbonat Vitamin K2 Cholecalciferol (Vitamin D3)', N'Kudos Bone Health Calcium D3 & Vitamin K2 bổ sung canxi vitamin K2 vitamin D3 cho cơ thể.', N'776/2023/ĐKSP', N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/DSC_09344_b38a024079.jpg'),
(3, N'Viên sủi Kudos Daily Vitamins Plus Biotin & Ginseng hương cam giúp bổ sung vitamin cho cơ thể (20 viên)', 1, 101200, N'Tuýp', N'Vitamin & Khoáng chất', N'Viên sủi', N'Tuýp 20 Viên', N'Singapore', N'SANOTACT GMBH', N'Đức', N'Vitamin C Chiết xuất nhân sâm Niacin Vitamin E Acid pantothenic Vitamin B2 Vitamin B6 Vitamin B1 Vitamin A Acid folic Biotin Vitamin D3 Vitamin B12', N'Kudos Daily Vitamins Plus Biotin & Ginseng hương cam giúp bổ sung vitamin (A C D E B1 B2 B3 B5 B6 B8 B9 B12) cho cơ thể.', N'3806/2023/ĐKSP', N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/DSC_09335_24b9811179.jpg'),
(4, N'Viên sủi Kudos Vitamin C 1000mg hương chanh giúp bổ sung vitamin C cho cơ thể (20 viên)', 1, 90400, N'Tuýp', N'Vitamin & Khoáng chất', N'Viên sủi', N'Tuýp 20 Viên', N'Singapore', N'SANOTACT GMBH', N'Đức', N'Vitamin C', N'Kudos Vitamin C 1000mg bổ sung vitamin C cho cơ thể. Sản phẩm thích hợp dùng cho người từ 14 tuổi trở lên có nhu cầu bổ sung vitamin C.', N'3813/2023/ĐKSP', N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/DSC_09324_db795e136a.jpg'),
(5, N'Viên uống Calci K-2 Pharma World hỗ trợ giảm nguy cơ loãng xương (60 viên)', 1, 470000, N'Hộp', N'Bổ sung Canxi & Vitamin D', N'Viên nén', N'Hộp 60 Viên', N'Mỹ', N'ARNET PHARMACEUTICAL', N'Hoa Kỳ', N'Zinc Magnesium Vitamin D3 Vitamin K2 Calcium (Ca+)', N'Pharma World Calci K2 bổ sung canxi và một số vitamin khoáng chất giúp chắc xương tăng khả năng hấp thụ canxi cho cơ thể hỗ trợ giảm nguy cơ loãng xương.', N'4938/2022/ĐKSP', N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3sgn09.fptcloud.com/00503275_vien_uong_bo_sung_canxi_giam_nguy_co_loang_xuong_pharma_word_calci_k_2_60v_2299_63ed_large_322e824179.jpg');

-- Insert sản phẩm thứ 6
INSERT INTO Product (IDProduct, Name, ID_Category, Price, Unit, Type, [Dosage forms], Packing, [Brand origin], Producer, [Manufacturing country], Ingredient, [Short description], [Registration number], Image_URL)
VALUES
(6, N'Viên uống bổ sung Omega-3 Triple Strength Fish Oil (60 viên)', 2, 350000, N'Hộp', N'Dinh dưỡng bổ sung', N'Viên nang mềm', N'Hộp 60 Viên', N'USA', N'Nature Made', N'Mỹ', N'Omega-3 fatty acids', N'Bổ sung Omega-3 giúp hỗ trợ sức khỏe tim mạch.', N'2021/10045/ĐKSP', N'https://example.com/omega3.jpg');

-- Insert sản phẩm thứ 7
INSERT INTO Product (IDProduct, Name, ID_Category, Price, Unit, Type, [Dosage forms], Packing, [Brand origin], Producer, [Manufacturing country], Ingredient, [Short description], [Registration number], Image_URL)
VALUES
(7, N'Viên uống vitamin tổng hợp Multivitamin (90 viên)', 2, 450000, N'Lọ', N'Vitamin tổng hợp', N'Viên nén', N'Lọ 90 Viên', N'Australia', N'Blackmores', N'Úc', N'Vitamins A, C, D, E, K, B1, B2, B6, B12, Folate, Biotin, Pantothenic Acid, Calcium, Iron, Magnesium, Zinc', N'Bổ sung vitamin và khoáng chất cần thiết cho cơ thể.', N'2021/10123/ĐKSP', N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/smalls/IMG_3863_f431c327df.jpg');

-- Insert sản phẩm thứ 8
INSERT INTO Product (IDProduct, Name, ID_Category, Price, Unit, Type, [Dosage forms], Packing, [Brand origin], Producer, [Manufacturing country], Ingredient, [Short description], [Registration number], Image_URL)
VALUES
(8, N'Viên uống bổ sung sắt Iron Complex (100 viên)', 2, 250000, N'Hộp', N'Dinh dưỡng bổ sung', N'Viên nén', N'Hộp 100 Viên', N'Germany', N'Doppelherz', N'Đức', N'Iron, Vitamin C, Folic Acid', N'Bổ sung sắt, hỗ trợ giảm thiếu máu do thiếu sắt.', N'2021/10234/ĐKSP', N'https://example.com/ironcomplex.jpg');

-- Insert sản phẩm thứ 9
INSERT INTO Product (IDProduct, Name, ID_Category, Price, Unit, Type, [Dosage forms], Packing, [Brand origin], Producer, [Manufacturing country], Ingredient, [Short description], [Registration number], Image_URL)
VALUES
(9, N'Viên uống bổ sung canxi Calcium D3 (60 viên)', 2, 300000, N'Hộp', N'Dinh dưỡng bổ sung', N'Viên nén', N'Hộp 60 Viên', N'USA', N'Nature Made', N'Mỹ', N'Calcium, Vitamin D3', N'Bổ sung canxi và vitamin D3 giúp xương chắc khỏe.', N'2021/10345/ĐKSP', N'https://example.com/calciumd3.jpg');

-- Insert sản phẩm thứ 10
INSERT INTO Product (IDProduct, Name, ID_Category, Price, Unit, Type, [Dosage forms], Packing, [Brand origin], Producer, [Manufacturing country], Ingredient, [Short description], [Registration number], Image_URL)
VALUES
(10, N'Viên uống hỗ trợ xương khớp Glucosamine (180 viên)', 2, 550000, N'Hộp', N'Dinh dưỡng bổ sung', N'Viên nén', N'Hộp 180 Viên', N'USA', N'Kirkland Signature', N'Mỹ', N'Glucosamine sulfate, Chondroitin sulfate', N'Hỗ trợ sức khỏe xương khớp.', N'2021/10456/ĐKSP', N'https://example.com/glucosamine.jpg');
INSERT INTO Product (IDProduct, Name, ID_Category, Price, Unit, Type, [Dosage forms], Packing, [Brand origin], Producer, [Manufacturing country], Ingredient, [Short description], [Registration number], Image_URL) VALUES
(11, N'Kem mặt nạ Transino Whitening Repair Cream EX phục hồi dưỡng trắng da dành cho da bị tổn thương (35g)', 2, 1110000, N'Hộp', N'Dưỡng da mặt', NULL, N'Hộp x 35g', N'Nhật Bản', NULL, N'Nhật Bản', NULL, N'Kem dưỡng trắng da Transino Whitening Repair Cream EX là dòng kem dưỡng trắng da, tái tạo và phục hồi da hư tổn cao cấp mới đến từ Nhật Bản. Sản phẩm giúp ức chế sự hình thành của hắc tố melanin và ngăn ngừa tàn nhang và các đốm đồi mồi, cho làn da trẻ trung, săn chắc.', NULL, N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/00502934_kem_duong_trang_da_transino_whitening_repair_cream_ex_35g_7907_6399_large_6c57c59ec1.jpg'),
(12, N'Mặt nạ Marine Luminous Pearl Deep Moisture Mask Peal JMsolution tăng cường dưỡng ẩm, dưỡng trắng (30ml)', 2, 22400, N'Cái', N'Mặt nạ', NULL, N'Cái', N'Hàn Quốc', N'JOR R&D CO., LTD', N'Hàn Quốc', NULL, N'JMsolution Marine Luminous Pearl Deep Moisture Mask là bộ sản phẩm chăm sóc cho da bao gồm: Step 1 - Marine waterfull essence: Tinh chất tăng cường dưỡng ẩm cho da. Step 2 – Marine Luminous Mask: Mặt nạ dưỡng ẩm và dưỡng trắng. Step 3 – Marine All Face Eye Cream: Kem dưỡng quanh vùng mắt.', NULL, N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/DSC_04765_fab02bb13a.jpg'),
(13, N'Gel làm mờ sẹo Fixderma Scars do mụn, bỏng, rạn da, vết thươngl (7ml)', 2, 166000, N'Tuýp', N'Trị sẹo, mờ vết thâm', NULL, N'Tuýp x 7ml', N'Mỹ', NULL, N'Ấn Độ', NULL, N'Fixderma Scar Gel là sản phảm gel giúp làm mờ sẹo do mụn, bỏng, rạn da, vết thương, phẫu thuật. Làm mềm và mịn màng vùng da bị ảnh hưởng bởi sẹo.', NULL, N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/DSC_04121_98d624a190.jpg'),
(14, N'Kem mụn Sulfur 10% Ointment Cospharm ngăn ngừa mụn và chăm sóc da mặt (30g)', 2, 245000, N'Tuýp', N'Sản phẩm trị mụn', N'Dạng kem', N'Tuýp x 30g', NULL, N'Đức', NULL, N'Đức', NULL, N'Kem Sulfur 10% Ointment Cospharm giúp ngăn ngừa mụn và chăm sóc da mặt. Sản phẩm có cơ chế làm tiêu nang mụn từ bên trong, giúp ngăn ngừa hình thành mụn.', NULL, N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/00017670_crevil_sulfur_10_ointment_cospharm_30g_kem_ngua_tri_mun_1469_62f9_large_58c27ae35f.jpg'),
(15, N'Kem Fixderma Skarfix-TX Cream hỗ trợ làm mờ vết thâm, đốm đen, nám (30g)', 2, 396000, N'Hộp', N'Nám, tàn nhang, đốm nâu', NULL, N'Hộp', N'Mỹ', N'FIXDERMA INDIA (P) LTD.', N'Ấn Độ', NULL, N'Kem trị nám Fixderma Skarfix - TX Cream được biết đến là loại kem giúp ngăn ngừa tình trạng xuất hiện đốm nâu, tàn nhang, dưỡng trắng hiệu quả mỗi ngày. Đặc biệt phù hợp với da gặp phải tình trạng nám, tàn nhang , đốm nâu do nhiều nguyên nhân, kể cả nám nội tiết, ngoài ra các vết thâm do mụn để lại.', NULL, N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/00032723_fixderma_skarfix_tx_cream_30g_kem_tri_nam_8784
INSERT INTO Product (IDProduct, Name, ID_Category, Price, Unit, Type, [Dosage forms], Packing, [Brand origin], Producer, [Manufacturing country], Ingredient, [Short description], [Registration number], Image_URL) VALUES
(11, N'Kem mặt nạ Transino Whitening Repair Cream EX phục hồi dưỡng trắng da dành cho da bị tổn thương (35g)', 2, 1110000, N'Hộp', N'Dưỡng da mặt', NULL, N'Hộp x 35g', N'Nhật Bản', NULL, N'Nhật Bản', NULL, N'Kem dưỡng trắng da Transino Whitening Repair Cream EX là dòng kem dưỡng trắng da, tái tạo và phục hồi da hư tổn cao cấp mới đến từ Nhật Bản. Sản phẩm giúp ức chế sự hình thành của hắc tố melanin và ngăn ngừa tàn nhang và các đốm đồi mồi, cho làn da trẻ trung, săn chắc.', NULL, N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/00502934_kem_duong_trang_da_transino_whitening_repair_cream_ex_35g_7907_6399_large_6c57c59ec1.jpg'),
(12, N'Mặt nạ Marine Luminous Pearl Deep Moisture Mask Peal JMsolution tăng cường dưỡng ẩm, dưỡng trắng (30ml)', 2, 22400, N'Cái', N'Mặt nạ', NULL, N'Cái', N'Hàn Quốc', N'JOR R&D CO., LTD', N'Hàn Quốc', NULL, N'JMsolution Marine Luminous Pearl Deep Moisture Mask là bộ sản phẩm chăm sóc cho da bao gồm: Step 1 - Marine waterfull essence: Tinh chất tăng cường dưỡng ẩm cho da. Step 2 – Marine Luminous Mask: Mặt nạ dưỡng ẩm và dưỡng trắng. Step 3 – Marine All Face Eye Cream: Kem dưỡng quanh vùng mắt.', NULL, N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/DSC_04765_fab02bb13a.jpg'),
(13, N'Gel làm mờ sẹo Fixderma Scars do mụn, bỏng, rạn da, vết thươngl (7ml)', 2, 166000, N'Tuýp', N'Trị sẹo, mờ vết thâm', NULL, N'Tuýp x 7ml', N'Mỹ', NULL, N'Ấn Độ', NULL, N'Fixderma Scar Gel là sản phảm gel giúp làm mờ sẹo do mụn, bỏng, rạn da, vết thương, phẫu thuật. Làm mềm và mịn màng vùng da bị ảnh hưởng bởi sẹo.', NULL, N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/DSC_04121_98d624a190.jpg'),
(14, N'Kem mụn Sulfur 10% Ointment Cospharm ngăn ngừa mụn và chăm sóc da mặt (30g)', 2, 245000, N'Tuýp', N'Sản phẩm trị mụn', N'Dạng kem', N'Tuýp x 30g', NULL, N'Đức', NULL, N'Đức', NULL, N'Kem Sulfur 10% Ointment Cospharm giúp ngăn ngừa mụn và chăm sóc da mặt. Sản phẩm có cơ chế làm tiêu nang mụn từ bên trong, giúp ngăn ngừa hình thành mụn.', NULL, N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/00017670_crevil_sulfur_10_ointment_cospharm_30g_kem_ngua_tri_mun_1469_62f9_large_58c27ae35f.jpg'),
(15, N'Kem Fixderma Skarfix-TX Cream hỗ trợ làm mờ vết thâm, đốm đen, nám (30g)', 2, 396000, N'Hộp', N'Nám, tàn nhang, đốm nâu', NULL, N'Hộp', N'Mỹ', N'FIXDERMA INDIA (P) LTD.', N'Ấn Độ', NULL, N'Kem trị nám Fixderma Skarfix - TX Cream được biết đến là loại kem giúp ngăn ngừa tình trạng xuất hiện đốm nâu, tàn nhang, dưỡng trắng hiệu quả mỗi ngày. Đặc biệt phù hợp với da gặp phải tình trạng nám, tàn nhang , đốm nâu do nhiều nguyên nhân, kể cả nám nội tiết, ngoài ra các vết thâm do mụn để lại.', NULL, N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/00032723_fixderma_skarfix_tx_cream_30g_kem_tri_nam_8784)
INSERT INTO Product (IDProduct, Name, ID_Category, Price, Unit, Type, [Dosage forms], Packing, [Brand origin], Producer, [Manufacturing country], Ingredient, [Short description], [Registration number], Image_URL) VALUES
(16, N'Kem bôi Rebirth Anti-Wrinkle Eye Gel giảm vết nhăn quanh vùng mắt và chống thâm vùng mắt (30g)', 2, 220000, N'Tuýp', NULL, N'Dạng kem', N'Tuýp', N'Úc', N'LANOPEARL PTY.LTD', N'Úc', NULL, N'Rebirth Anti-Wrinkle Eye Gel làm giảm vết nhăn quanh vùng mắt và chống thâm vùng mắt.', NULL, N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/00030331_rebirth_anti_wrinkle_eye_gel_whit_vitamin_e_gel_giam_nhan_va_mo_tham_vung_mat_30g_9913_6065_large_064f16105d.jpg'),
(17, N'Bao cao su Sagami Classic siêu mỏng, nhiều chất bôi trơn, không mùi (12 cái)', 3, 148000, N'Hộp', N'Bao cao su', NULL, N'Hộp 12 cái', N'Nhật Bản', N'SAGAMI RUBBER IND,.CO,. LTD', N'Nhật Bản', NULL, N'Bao cao su Sagami Classic Nhật Bản có kích thước siêu mỏng, bổ sung nhiều gel bôi trơn, không có mùi khó chịu. Sử dụng bao cao su đúng cách là cách phòng tránh thai và các bệnh lây truyền qua đường tình dục hiệu quả.', NULL, N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/00503158_bcs_sagami_classic_sieu_mong_nhieu_gel_boi_tron_mau_da_khong_mui_12_cai_1445_63d7_large_84cbe583d1.jpg'),
(18, N'Bao cao su Sagami Love Me Gold siêu mỏng, trơn, không màu không mùi (10 cái)', 3, 90000, N'Hộp', NULL, NULL, N'Hộp 10 cái', N'Nhật Bản', N'SAGAMI RUBBER IND,.CO,. LTD', N'Nhật Bản', NULL, N'Bao cao su Sagami Love Me Gold có kích thước siêu mỏng, trơn và không màu không mùi, mang đến cảm giác dễ chịu và thăng hoa cho cặp đôi. Sử dụng bao cao su đúng cách giúp phòng tránh thai và bệnh lây qua đường tình dục hiệu quả.', NULL, N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/00503128_bao_cao_su_sagami_love_me_gold_vay_tu_y_te_ha_noi_hop_10_cai_6824_63d7_large_7280123f66.jpg'),
(19, N'Viên ngậm ho Bách Bộ Mom And Baby Tất Thành hỗ trợ giảm rát họng, ngứa cổ, khản tiếng (5 vỉ x 4 viên)', 3, 55000, N'Hộp', N'Kẹo cứng', N'Kẹo Cứng', N'Hộp 5 vỉ x 4 viên', N'Việt Nam', N'Tất Thành', N'Việt Nam', NULL, N'Viên ngậm ho Bách Bộ Mom and Baby giúp bổ phế giảm ho, giảm đau rát họng, ngứa cổ, khản tiếng. Giúp làm giảm các triệu chứng ho gió, ho khan, ho do cảm lạnh hoặc do thay đổi thời tiết.', NULL, N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/00018464_ngam_ho_bach_bo_mom_and_baby_tat_thanh_5x4_9373_6393_large_1dc4280a6f.jpg'),
(20, N'Viên ngậm Bipp C DHG Pharma vị cam hỗ trợ tăng cường sức đề kháng (35 gói)', 3, 100000, N'Hộp', N'Kẹo cứng', N'Kẹo Cứng', N'Hộp 35 gói', N'Việt Nam', N'CÔNG TY CỔ PHẦN DƯỢC HẬU GIANG', N'Việt Nam', NULL, N'Bipp C vị cam với hương vị thơm ngọt bổ sung vitamin C cho cơ thể một cách dễ dàng và nhanh chóng, giúp tăng cường sức đề kháng, bảo vệ thành mạch. Thích hợp dùng cho trẻ em và người lớn cần bổ sung vitamin C, người có sức đề kháng kém.', NULL, N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/IMG_4995_a88d9245e2.jpg');
INSERT INTO Product (IDProduct, Name, ID_Category, Price, Unit, Type, [Dosage forms], Packing, [Brand origin], Producer, [Manufacturing country], Ingredient, [Short description], [Registration number], Image_URL) VALUES
(21, N'Đường ăn kiêng Equal Classic Zero Calorie Sweetener (100 gói x 1g)', 3, 129000, N'Hộp', NULL, NULL, N'Hộp 100 gói', N'Thái Lan', N'SANKO MACHINERY', N'Thái Lan', NULL, N'Đường ăn kiêng Equal ít năng lượng dành cho người kiêng ăn chất bột, đường (người tiểu đường, béo phì).', NULL, N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/00002643_duong_equal_100_goi_5438_63fe_large_9046166e55.jpg'),
(22, N'Gel rửa tay khô Natural Hand Sanitizer trà xanh và sả chanh làm sạch tay, khử mùi, dưỡng ẩm (120ml)', 3, 39000, N'Chai', NULL, NULL, N'Chai x 120ml', N'Việt Nam', N'LA BEAUTE', N'Việt Nam', NULL, N'Natural Hand Sanitizer làm sạch vi khuẩn và bụi bẩn bám trên tay, ngăn ngừa các bệnh lây nhiễm qua tay.', NULL, N'https://cdn.nhathuoclongchau.com.vn/unsafe/373x0/filters:quality(90)/https://cms-prod.s3-sgn09.fptcloud.com/00028200_gel_rua_tay_kho_natural_hand_sanitizer_la_beaute_120ml_5244_62ba_large_037879fcc6.jpg');
