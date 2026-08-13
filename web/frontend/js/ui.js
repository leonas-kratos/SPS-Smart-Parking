// ============================================================
// ui.js – Render UI, không còn đọc/ghi localStorage cho data
// ============================================================
import {
    fetchParkingStatus,
    fetchCurrentLog,
    fetchVehicleLogs,
    fetchRevenue,
} from "./api.js";
import { currentUser } from "./auth.js";
import { publishBook, mqttClient } from "./mqtt.js";

const SLOT_MAP = ["A1", "A2", "A3", "A4"];
const BANK_ID = "BIDV";
const ACCOUNT_NO = "8800379881";
const TEMPLATE = "compact2";
const ACCOUNT_NAME = "VU NHAT QUANG";

let adminVehicleLogs = [];
let currentSortOrder = "desc";
let revenueChartInstance = null;
let myBookedSlot = null;

// ─── Tab navigation ──────────────────────────────────────────
const tabs = document.querySelectorAll(".tab");
const adminTabs = document.querySelectorAll(".admin-tab");
const pages = document.querySelectorAll(".page");

tabs.forEach((tab) => {
    tab.addEventListener("click", (e) => {
        window.switchTab(e.currentTarget.getAttribute("data-target"));
    });
});
adminTabs.forEach((tab) => {
    tab.addEventListener("click", (e) => {
        window.switchAdminTab(e.currentTarget.getAttribute("data-target"));
    });
});

window.switchTab = async function (targetTab) {
    const { logout } = await import("./auth.js");
    if (targetTab === "logout") {
        logout();
        return;
    }

    tabs.forEach((t) => t.classList.remove("active"));
    document
        .querySelector(`.tab[data-target="${targetTab}"]`)
        .classList.add("active");
    pages.forEach((p) => p.classList.remove("active"));
    document.getElementById(`page-${targetTab}`).classList.add("active");
};

window.switchAdminTab = async function (targetTab) {
    if (targetTab === "logout") {
        const { logout } = await import("./auth.js");
        logout();
        return;
    }

    adminTabs.forEach((t) => t.classList.remove("active"));
    document
        .querySelector(`.admin-tab[data-target="${targetTab}"]`)
        .classList.add("active");
    document
        .querySelectorAll(".admin-page")
        .forEach((p) => p.classList.remove("active"));
    document.getElementById(`admin-page-${targetTab}`).classList.add("active");

    const titleMap = {
        dashboard: "Dashboard",
        vehicles: "Vehicles",
        revenue: "Revenue",
    };
    document.getElementById("admin-topbar-title").innerText =
        titleMap[targetTab] || "";

    if (targetTab === "vehicles" || targetTab === "revenue") {
        await loadAdminVehicleData();
    }
    if (targetTab === "revenue") {
        await loadRevenueChart();
    }
    if (targetTab === "dashboard") {
        await loadStorage();
    }
};

// ─── Parking slots UI (từ MQTT real-time) ────────────────────
const slotElements = document.querySelectorAll(".slot");
const fullWarning = document.querySelector(".full-warning");
const gasWarning = document.querySelector(".gas-warning");
const floodWarning = document.querySelector(".flood-warning");

export function updateSlotsUI(data) {
    if (!data.slots) return;
    let occupiedCount = 0;

    data.slots.forEach((slotData) => {
        const slotName = SLOT_MAP[slotData.id];
        const element = document.getElementById(`slot-${slotName}`);
        if (!element) return;

        const existingIdElement = element.querySelector('.slot-id');
        let currentDisplayId = null;
        if (existingIdElement) {
            currentDisplayId = existingIdElement.innerText;
        }

        // Reset classes
        element.classList.remove("occupied", "book", "owner");

        // CHỌN ID ĐỂ HIỂN THỊ: 
        // Ưu tiên 1: bookId từ Vi điều khiển gửi lên.
        // Ưu tiên 2: ID xe thực tế đang đỗ do Camera gán (currentDisplayId).
        let displayId = slotData.bookId;
        if (!displayId && slotData.isOccupied && currentDisplayId) {
            displayId = currentDisplayId;
        }

        let innerHtml = `<div>${slotName}</div>`;
        if (displayId) {
            innerHtml += `<div class="slot-id">${displayId}</div>`;
        }
        element.innerHTML = innerHtml;

        // Apply state classes
        if (slotData.isOccupied) {
            // Slot occupied → show occupied only
            element.classList.add("occupied");
            occupiedCount++;
            if (window.myBookedSlot === slotName && slotData.bookId !== currentUser?.vehicleId) {
                 window.myBookedSlot = null;
            }
        } else if (slotData.isBookedWeb) {
            // Slot booked but empty → show .book (yellow)
            element.classList.add("book");
            // If booked by current user → also show .owner (red border)
            if (
                currentUser?.vehicleId &&
                slotData.bookId === currentUser.vehicleId
            ) {
                element.classList.add("owner");
                window.myBookedSlot = slotName;
            }
        }
        // else: slot empty & not booked → no classes
    });

    // Show full warning if occupied slots >= total slots
    if (fullWarning)
        fullWarning.style.display =
            occupiedCount === SLOT_MAP.length ? "block" : "none";
}

export function updateWarnings(data) {
    if (data.warning === "GAS!" || data.warning === "No gas") {
        if (gasWarning)
            gasWarning.style.display =
                data.warning === "GAS!" ? "block" : "none";
    }
}

export function updateCameraSlot(data) {
    if (!data.status || !data.slot) return;

    const slotLabel = data.slot;
    const slotElement = document.getElementById(`slot-${slotLabel}`);

    // 1. Cập nhật thông tin text trong tab Info (chỉ dành riêng cho user hiện tại)
    if (currentUser?.vehicleId && data.id === currentUser.vehicleId) {
        if (data.status === "park_in" || data.status === "steal") {
            document.getElementById("txt-slot").innerText = slotLabel;
        } else if (data.status === "park_out" || data.status === "left_out") {
            document.getElementById("txt-slot").innerText = "--";
        }
    }

    // 2. Gán/Hủy thẻ ID trực tiếp trên UI chuồng đỗ (dành cho MỌI xe di chuyển)
    if (slotElement) {
        if (data.status === "park_in") {
            slotElement.innerHTML = `<div>${slotLabel}</div><div class="slot-id">${data.id}</div>`;
        } else if (data.status === "left_out" || data.status === "park_out") {
            slotElement.innerHTML = `<div>${slotLabel}</div>`;
        } else if (data.status === "steal") {
            // Lập tức đổi UI: gỡ màu vàng đặt chỗ, đổi sang màu đỏ đỗ xe, hiển thị ID kẻ cướp
            slotElement.classList.remove("book", "owner");
            slotElement.classList.add("occupied");
            slotElement.innerHTML = `<div>${slotLabel}</div><div class="slot-id">${data.id}</div>`;
        }
    }

    // 3. Xử lý Logic Cảnh báo Cướp chỗ
    if (data.status === "steal") {
        // Kiểm tra xem slot vừa bị cướp có phải là slot của user này đang book hay không
        if (window.myBookedSlot === slotLabel && data.id !== currentUser?.vehicleId) {
            const stolenWarning = document.getElementById("stolen-id");
            if (stolenWarning) {
                stolenWarning.style.display = "block";
            }
            window.myBookedSlot = null; // Mất quyền sở hữu
        }
    }
}

// ─── Customer info page ─────────────────────────────────────
export async function loadUserInfo(vehicleId) {
    document.getElementById("txt-id").innerText = vehicleId;
    document.getElementById("txt-name").innerText =
        currentUser?.username || "--";
    document.getElementById("txt-number").innerText =
        currentUser?.vehicleNumber || "--";

    const log = await fetchCurrentLog(vehicleId);
    if (log) {
        const slotLabel = SLOT_MAP[parseInt(log.slot)] ?? log.slot ?? "--";
        // document.getElementById("txt-slot").innerText = slotLabel;
        document.getElementById("txt-date").innerText = log.date || "--";
        document.getElementById("txt-checkin").innerText = log.checkin || "--";
        document.getElementById("txt-checkout").innerText =
            log.checkout || "--";

        const price = calculatePrice(log.checkin, log.checkout);
        document.getElementById("txt-price").innerText = price;
        generateQR(price, vehicleId);
    } else {
        ["txt-date", "txt-checkin", "txt-checkout", "txt-price"].forEach(
            (id) => {
                document.getElementById(id).innerText = "--";
            },
        );
    }
}

// Gọi khi nhận MQTT rfid message và id khớp user hiện tại
export function updateCurrentInfo(data) {
    if (data.type == "in") document.getElementById("txt-slot").innerText = "--";
    if (data.date !== undefined)
        document.getElementById("txt-date").innerText = data.date || "--";
    if (data.checkin !== undefined)
        document.getElementById("txt-checkin").innerText = data.checkin || "--";
    if (data.checkout !== undefined || data.type === "in")
        document.getElementById("txt-checkout").innerText =
            data.checkout || "--";

    const checkin = document.getElementById("txt-checkin").innerText;
    const checkout = document.getElementById("txt-checkout").innerText;
    const price = calculatePrice(checkin, checkout);
    document.getElementById("txt-price").innerText = price;
    generateQR(price, currentUser?.vehicleId);
}

// ─── Tải trạng thái ban đầu từ API + localStorage ───
export async function loadStorage() {
    try {
        const status = await fetchParkingStatus();
        if (status.slots) updateSlotsUI({ slots: status.slots });
        if (gasWarning)
            gasWarning.style.display =
                status.gasStatus === "GAS!" ? "block" : "none";
        if (floodWarning)
            floodWarning.style.display =
                status.floodStatus === "FLOOD!" ? "block" : "none";
        if (fullWarning)
            fullWarning.style.display = status.isFull ? "block" : "none";
    } catch (e) {
        console.warn("loadStorage:", e.message);
    }
}

window.book = async function (el) {
    const slotId = el.id;
    const slotName = slotId.replace("slot-", "");
    const slotIndex = SLOT_MAP.indexOf(slotName);

    if (el.classList.contains("occupied")) return;

    try {
        const status = await fetchParkingStatus();
        const slot = status.slots[slotIndex];

        if (!slot) {
            alert("Slot data not available yet. Please try again.");
            return;
        }

        // ─── KỊCH BẢN 1: Slot này đã được user book rồi → hỏi hủy
        if (
            slot.isBookedWeb &&
            slot.bookId === currentUser?.vehicleId &&
            !confirm("Cancel this booking?")
        ) {
            return;
        }

        // ─── KỊCH BẢN 2: Slot này đã được book bởi người khác → không cho book
        if (slot.isBookedWeb && slot.bookId !== currentUser?.vehicleId) {
            alert("This slot is already booked by someone else");
            return;
        }

        // ─── KỊCH BẢN 3: User đã book slot khác → không cho book thêm
        const hasOtherBooking = status.slots.some(
            (s) =>
                s.isBookedWeb &&
                s.bookId === currentUser?.vehicleId &&
                s.id !== slotIndex,
        );
        if (hasOtherBooking && !slot.isBookedWeb) {
            alert("You already have a booking. Please cancel it first");
            return;
        }

        // ─── KỊCH BẢN 4: Slot occupied → không cho book
        if (slot.isOccupied) {
            alert("This slot is occupied");
            return;
        }

        // ─── KỊCH BẢN 5: Slot empty → hỏi book hoặc cancel
        const action =
            slot.isBookedWeb && slot.bookId === currentUser?.vehicleId
                ? "Cancel"
                : "Book";

        if (!confirm(`${action} this slot?`)) return;

        // Immediate visual feedback
        if (action === "Book") {
            el.classList.add("book", "owner");
            publishBook(currentUser.vehicleId, slotIndex, "book");
        } else {
            el.classList.remove("book", "owner");
            publishBook(currentUser.vehicleId, slotIndex, "cancel");
        }
    } catch (error) {
        console.error("Book error:", error.message);
        alert("Failed to check parking status");
    }
};

// ─── Admin: vehicle table ────────────────────────────────────
export async function loadAdminVehicleData() {
    try {
        adminVehicleLogs = await fetchVehicleLogs();
        renderVehicleTable();
    } catch (e) {
        console.warn("loadAdminVehicleData:", e.message);
    }
}

function renderVehicleTable() {
    const tbody = document.getElementById("vehicle-table-body");
    const dateFilterValue = document.getElementById("date-filter").value;

    let data = [...adminVehicleLogs];

    if (dateFilterValue) {
        const [year, month, day] = dateFilterValue.split("-");
        const formatted = `${day}/${month}/${year}`;
        data = data.filter((item) => item.date === formatted);
    }

    data.sort((a, b) => {
        const tA = a.checkout === "--" ? "00:00:00" : a.checkout;
        const tB = b.checkout === "--" ? "00:00:00" : b.checkout;
        return currentSortOrder === "ascending"
            ? tA.localeCompare(tB)
            : tB.localeCompare(tA);
    });

    tbody.innerHTML = "";
    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">No data</td></tr>`;
        return;
    }
    data.forEach((item) => {
        const tr = document.createElement("tr");
        const priceLabel = item.price
            ? Number(item.price).toLocaleString("vi-VN")
            : "--";
        tr.innerHTML = `
      <td>${item.name}</td>
      <td>${item.vehicleId}</td>
      <td>${item.vehicleNumber}</td>
      <td>${item.slot}</td>
      <td>${item.date}</td>
      <td>${item.checkin}</td>
      <td>${item.checkout}</td>
      <td>${priceLabel}</td>`;
        tbody.appendChild(tr);
    });
}

window.applyFilter = () => renderVehicleTable();
window.sortVehicles = (order) => {
    currentSortOrder = order;
    renderVehicleTable();
};

// ─── Admin: revenue chart ────────────────────────────────────
export async function loadRevenueChart() {
    const revenueData = await fetchRevenue();
    const xLabel = revenueData.map((d) => d.date);
    const revenues = revenueData.map((d) => d.total);

    const ctx = document.getElementById("revenueChart").getContext("2d");
    if (revenueChartInstance) revenueChartInstance.destroy();

    revenueChartInstance = new Chart(ctx, {
        type: "bar",
        plugins: [ChartDataLabels],
        data: {
            labels: xLabel,
            datasets: [
                {
                    data: revenues,
                    backgroundColor: "#3b82f6",
                    borderRadius: 4,
                    barPercentage: 0.6,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true },
                x: { grid: { display: false } },
            },
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: "end",
                    align: "top",
                    formatter: (v) => (v > 0 ? v.toLocaleString() : "0"),
                    color: "#333",
                    font: { weight: "bold" },
                },
            },
            layout: { padding: { top: 30 } },
        },
    });
}

// ─── Helpers ─────────────────────────────────────────────────
function calculatePrice(checkin, checkout) {
    if (!checkin || !checkout || checkin === "--" || checkout === "--")
        return "--";
    const [inH, inM, inS] = checkin.split(":").map(Number);
    const [outH, outM, outS] = checkout.split(":").map(Number);
    let diff = outH + outM / 60 + outS / 3600 - (inH + inM / 60 + inS / 3600);
    if (diff < 0) diff += 24;
    if (diff <= 2) return "5,000";
    if (diff <= 6) return "8,000";
    return "12,000";
}

function generateQR(priceString, id) {
    const qrContainer = document.getElementById("qr-container");
    const qrImage = document.getElementById("qr-image");
    if (!priceString || priceString === "--") {
        qrContainer.style.display = "none";
        return;
    }
    const amount = priceString.replace(/,/g, "");
    if (amount === "0") {
        qrContainer.style.display = "none";
        return;
    }
    const desc = `${id} PAYMENT`;
    qrImage.src = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-${TEMPLATE}.png?amount=${amount}&addInfo=${encodeURIComponent(desc)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;
    qrContainer.style.display = "block";
}
