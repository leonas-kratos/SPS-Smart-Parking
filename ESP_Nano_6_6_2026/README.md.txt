1. Xe vào
- B1: Kiểm tra quét RFID thành công?
+ Không: Bãi đã đầy
+ Có: B2
- B2: Mở cửa*
- B3: Xác nhận xe đã đỗ chưa?
+ Không: Xác nhận lại
+ Có: B4
- B4: Gửi dữ liệu lên server bằng MQTT
- B5: Cập nhật UI trên web/app

2. Xe ra
- B1: Quét RFID
- B2: Mở cửa*
- B3: Gửi dữ liệu lên server bằng MQTT
- B4: Cập nhật UI trên web/app

*Mở cửa
- B1: Mở cửa
- B2: Kiểm tra xe đang vào/ra?
+ Không: Kiểm tra lại
+ Có: B3
- B3: Kiểm tra xe đã đi qua?
+ Không: Kiểm tra lại
+ Có: B4
- B4: Delay 3s đợi xe đi qua hẳn
- B5: Đóng cửa