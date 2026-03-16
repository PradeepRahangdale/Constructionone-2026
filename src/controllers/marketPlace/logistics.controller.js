import orderModel from "../../models/marketPlace/order.model.js";
import orderTrackingModel from "../../models/marketPlace/orderTracking.model.js";

// User Order Place
//         ↓
// Vendor Accept Order
//         ↓
// Vendor Prepare Package
//         ↓
// Vendor Click "Ready to Ship"
//         ↓
// createShipment API Call
//         ↓
// AWB Generated
//         ↓
// Courier Pickup

export const createShipment = async (req, res) => {
  try {
    const { orderId } = req.body;

    const order = await orderModel.findById(orderId).populate("userId");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const payload = {
      order_id: order._id,
      order_date: new Date(),
       billing_customer_name: `${order.userId.firstName} ${order.userId.lastName}`,
      billing_phone: order.userId.phone,
      billing_address: order.shippingAddress?.address,
      billing_city: order.shippingAddress?.city,
      billing_state: order.shippingAddress?.state,
      billing_pincode: order.shippingAddress?.pincode,
      sub_total: order.totalAmount,
    };

// 1 User place order
// 2 Backend check shipping rate from logistics API
// 3 Delivery charge add in order
// 4 User pay total amount
// 5 Settlement me vendor ko product amount milega
// 6 Delivery charge logistics ko jayega

    const response = await axios.post(process.env.LOGISTICS_API, payload);
    const shipment = response.data;

    // update order logistics details
    order.awbCode = shipment.awb_code;
    order.shipmentId = shipment.shipment_id;
    order.courierName = shipment.courier;

    // ETA only in order model
    order.estimatedDeliveryDate = shipment.estimated_delivery_date;
    order.estimatedDeliveryTime = shipment.estimated_delivery_time;

    order.logisticsStatus = "SHIPMENT_CREATED";
    order.status = "SHIPPED";

    await order.save();

    // tracking history
    await orderTrackingModel.create({
      orderId: order._id,
      status: "SHIPMENT_CREATED",
      message: "Shipment created successfully",
      updatedBy: "SYSTEM",
    });

    res.json({h
      success: true,
      message: "Shipment created successfully",
      data: {
        awb: shipment.awb_code,
        courier: shipment.courier,
        estimatedDeliveryDate: shipment.estimated_delivery_date,
        estimatedDeliveryTime: shipment.estimated_delivery_time,
      },
    });
  } catch (error) {
    console.error("Shipment Error:", error);

    res.status(500).json({
      success: false,
      message: "Shipment creation failed",
    });
  }
};

export const logisticsWebhook = async (req, res) => {
  try {
    const {
      awb,
      status,
      location,
      estimated_delivery_date,
      estimated_delivery_time,
    } = req.body;

    const order = await orderModel.findOne({
      awbCode: awb,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // update logistics status
    order.logisticsStatus = status;

    // update order status based on courier status
    if (status === "OUT_FOR_DELIVERY") {
      order.status = "OUT_FOR_DELIVERY";
    }

    if (status === "DELIVERED") {
      order.status = "DELIVERED";
      order.deliveredDate = new Date();
    }

    // update ETA only in order model
    if (estimated_delivery_date) {
      order.estimatedDeliveryDate = estimated_delivery_date;
    }

    if (estimated_delivery_time) {
      order.estimatedDeliveryTime = estimated_delivery_time;
    }

    await order.save();

    // tracking history
    await orderTrackingModel.create({
      orderId: order._id,
      status: status,
      message: `Order ${status}`,
      location: location,
      updatedBy: "LOGISTICS",
    });

    res.json({
      success: true,
    });
  } catch (error) {
    console.error("Webhook error:", error);

    res.status(500).json({
      success: false,
      message: "Webhook error",
    });
  }
};

//ye data logistic wala send krega
// {
//   "awb": "SR123456789",
//   "status": "IN_TRANSIT",
//   "location": "Indore Hub",
//   "estimated_delivery_date": "2026-03-18",
//   "estimated_delivery_time": "18:00"
// }

export const getOrderTracking = async (req, res) => {
  try {
    const { orderId } = req.params;
    const tracking = await orderTrackingModel
      .find({ orderId })
      .sort({ createdAt: 1 });

    res.json({
      success: true,
      tracking,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Tracking fetch failed",
    });
  }
};
