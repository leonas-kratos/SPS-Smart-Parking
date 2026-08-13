import cv2

# Hàm xử lý sự kiện click chuột
def click_event(event, x, y, flags, params):
    # Khi nhấn chuột trái, in tọa độ ra màn hình console
    if event == cv2.EVENT_LBUTTONDOWN:
        print(f"Tọa độ bạn vừa click: x={x}, y={y}")
        
        # Vẽ một dấu chấm tròn đỏ tại điểm vừa click để dễ nhìn
        cv2.circle(frame, (x, y), 5, (0, 0, 255), -1)
        cv2.imshow("Camera - An ESC de thoat", frame)

cap = cv2.VideoCapture(1) # Đổi thành 0 nếu 1 không lên hình

print("MỞ CAMERA THÀNH CÔNG!")
print("-> Hãy click chuột trái vào vùng muốn lấy tọa độ.")
print("-> Nhấn phím ESC để thoát.")

while True:
    ret, frame = cap.read()
    if not ret:
        break
    
    cv2.imshow("Camera - An ESC de thoat", frame)
    
    # Gắn sự kiện chuột vào cửa sổ "Camera - An ESC de thoat"
    cv2.setMouseCallback("Camera - An ESC de thoat", click_event)

    # Nhấn ESC để thoát
    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()