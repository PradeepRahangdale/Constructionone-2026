// // src/services/delivery.service.js
// import { VendorCompany } from "../models/vendorShop/vendor.model.js";

// //frontend input
// // {
// //   "items": [
// //     {
// //       "vendorId": "67f8a1b2c3d4e5f6a7b8c9d0",
// //       "quantity": 10,
// //       "variant": {
// //         "measurementUnit": "kg",
// //         "weight": 50,
// //         "packageDimensions": "60*40*20"
// //       }
// //     },
// //     {
// //       "vendorId": "67f8a1b2c3d4e5f6a7b8c9d0",
// //       "quantity": 5,
// //       "variant": {
// //         "measurementUnit": "piece",
// //         "weight": 8,
// //         "packageDimensions": "100*15*15"
// //       }
// //     },
// //     {
// //       "vendorId": "67f8a1b2c3d4e5f6a7b8c9d1",
// //       "quantity": 2,
// //       "variant": {
// //         "measurementUnit": "cubicmeter",
// //         "weight": 1800,
// //         "packageDimensions": "200*100*100"
// //       }
// //     }
// //   ],
// //   "shippingAddress": {
// //     "pincode": "462001"
// //   }
// // }

// export const calculateVendorDeliveryCharges = async (
//   items,
//   shippingPincode,
// ) => {
//   const groupedByVendor = items.reduce((acc, item) => {
//     const vid = item.vendorId.toString();
//     if (!acc[vid]) acc[vid] = [];
//     acc[vid].push(item);
//     return acc;
//   }, {});

//   const result = [];

//   for (const [vendorId, vendorItems] of Object.entries(groupedByVendor)) {
//     const vendor = await VendorCompany.findById(vendorId).select(
//       "companyName businessAddress.pincode",
//     );

//     if (!vendor) continue;

//     const packageInfo = calculateConstructionPackage(vendorItems);

//     let deliveryCharge = 0;
//     let deliveryMethod = "Standard Delivery";

//     // === Main Logic based on Measurement Unit ===
//     if (packageInfo.hasHeavyUnit) {
//       deliveryCharge = calculateHeavyCharge(packageInfo);
//       deliveryMethod = "Truck / Tempo";
//     } else if (packageInfo.totalWeight >= 200) {
//       deliveryCharge = calculateMediumCharge(packageInfo);
//       deliveryMethod = "Mini Truck";
//     } else {
//       deliveryCharge = calculateLightCharge(packageInfo);
//       deliveryMethod = "Courier / Small Vehicle";
//     }

//     result.push({
//       vendorId,
//       vendorName: vendor.companyName,
//       deliveryCharge: Math.round(deliveryCharge),
//       deliveryMethod,
//       estimatedDays: packageInfo.totalWeight > 500 ? 3 : 2,
//       packageInfo,
//     });
//   }

//   const totalDeliveryCharge = result.reduce(
//     (sum, v) => sum + v.deliveryCharge,
//     0,
//   );

//   return {
//     perVendorCharges: result,
//     totalDeliveryCharge,
//   };
// };

// // ====================== CORE CALCULATION FUNCTION ======================

// const calculateConstructionPackage = (items) => {
//   let totalWeight = 0; // in KG
//   let totalVolume = 0; // in Cubic CM (approx)
//   let hasHeavyUnit = false;

//   items.forEach((item) => {
//     const variant = item.variant || {};
//     const qty = item.quantity || 1;
//     const unit = variant.measurementUnit || "piece";

//     let itemWeight = variant.weight || 0;

//     // Smart Weight Calculation based on measurementUnit
//     switch (unit) {
//       case "kg":
//       case "cubicmeter":
//         itemWeight = (variant.weight || 50) * qty; // heavy items
//         hasHeavyUnit = true;
//         break;

//       case "liter":
//         itemWeight = (variant.weight || 1) * qty;
//         break;

//       case "meter":
//       case "supermeter":
//       case "roll":
//         itemWeight = (variant.weight || 5) * qty; // rods, pipes, wires
//         break;

//       case "box":
//       case "set":
//         itemWeight = (variant.weight || 20) * qty;
//         break;

//       case "piece":
//       default:
//         itemWeight = (variant.weight || 2) * qty;
//     }

//     totalWeight += itemWeight;

//     // Volume from packageDimensions (e.g. "80*60*30")
//     if (variant.packageDimensions) {
//       const [l, w, h] = variant.packageDimensions.split("*").map(Number);
//       totalVolume += (l || 10) * (w || 10) * (h || 10) * qty;
//     }
//   });

//   const volumetricWeight = Math.round(totalVolume / 5000); // Standard volumetric divisor

//   return {
//     totalWeight: Math.round(totalWeight),
//     totalVolume: Math.round(totalVolume),
//     volumetricWeight,
//     effectiveWeight: Math.max(Math.round(totalWeight), volumetricWeight),
//     hasHeavyUnit,
//     unitBreakdown: items.map((i) => ({
//       unit: i.variant?.measurementUnit,
//       qty: i.quantity,
//     })),
//   };
// };

// // ====================== CHARGE CALCULATORS ======================

// const calculateHeavyCharge = (pkg) => {
//   // Sand, Cement, Steel, Concrete, Bricks etc.
//   const ratePerKg = 2.8; // ₹ per kg (you can make this configurable)
//   let charge = pkg.effectiveWeight * ratePerKg;

//   if (charge < 500) charge = 500; // Minimum charge for heavy material
//   return charge;
// };

// const calculateMediumCharge = (pkg) => {
//   return Math.max(250, pkg.effectiveWeight * 3.5);
// };

// const calculateLightCharge = (pkg) => {
//   return Math.max(90, pkg.effectiveWeight * 5);
// };

// src/services/delivery.service.js
import { VendorCompany } from "../models/vendorShop/vendor.model.js";
import { getDistanceInKm } from "../utils/getDistanceInKm.js"; // ← Yeh already hai tumhare project mein

export const calculateVendorDeliveryCharges = async (
  items,
  shippingAddress,
) => {
  const groupedByVendor = items.reduce((acc, item) => {
    const vid = item.vendorId.toString();
    if (!acc[vid]) acc[vid] = [];
    acc[vid].push(item);
    return acc;
  }, {});

  const result = [];

  for (const [vendorId, vendorItems] of Object.entries(groupedByVendor)) {
    const vendor = await VendorCompany.findById(vendorId).select(
      "companyName businessAddress",
    );

    if (
      !vendor?.businessAddress?.latitude ||
      !vendor?.businessAddress?.longitude
    ) {
      // Agar vendor ka lat/lon nahi hai to fallback
      result.push({
        vendorId,
        vendorName: vendor?.companyName || "Unknown Vendor",
        deliveryCharge: 150,
        deliveryMethod: "Standard",
        estimatedDays: 3,
        note: "Vendor location not available",
      });
      continue;
    }

    const packageInfo = calculateConstructionPackage(vendorItems);

    // === Distance Calculate Karo ===
    const distanceKm = getDistanceInKm(
      vendor.businessAddress.latitude,
      vendor.businessAddress.longitude,
      shippingAddress.latitude,
      shippingAddress.longitude,
    );

    // === Final Charge Calculation (Weight + Distance) ===
    let deliveryCharge = calculateFinalDeliveryCharge(packageInfo, distanceKm);

    result.push({
      vendorId,
      vendorName: vendor.companyName,
      deliveryCharge: Math.round(deliveryCharge),
      deliveryMethod: distanceKm > 50 ? "Truck" : "Mini Truck / Courier",
      distanceKm: Math.round(distanceKm),
      estimatedDays: distanceKm > 100 ? 4 : distanceKm > 50 ? 3 : 2,
      packageInfo,
    });
  }

  const totalDeliveryCharge = result.reduce(
    (sum, v) => sum + v.deliveryCharge,
    0,
  );

  return {
    perVendorCharges: result,
    totalDeliveryCharge,
  };
};

// ====================== MAIN CHARGE CALCULATOR ======================
const calculateFinalDeliveryCharge = (pkg, distanceKm) => {
  let baseCharge = 0;

  // Heavy Material (Sand, Cement, Steel, Cubic Meter etc.)
  if (pkg.hasHeavyUnit || pkg.totalWeight >= 300) {
    baseCharge = pkg.effectiveWeight * 2.5; // ₹2.5 per kg base
    baseCharge += distanceKm * 4; // ₹4 per KM
    if (baseCharge < 450) baseCharge = 450;
  }
  // Medium Weight
  else if (pkg.totalWeight >= 50) {
    baseCharge = pkg.effectiveWeight * 3.5;
    baseCharge += distanceKm * 3;
    if (baseCharge < 180) baseCharge = 180;
  }
  // Light Items
  else {
    baseCharge = pkg.effectiveWeight * 5;
    baseCharge += distanceKm * 2.5;
    if (baseCharge < 80) baseCharge = 80;
  }

  return baseCharge;
};

// Package Calculator (pehle wala improved)
const calculateConstructionPackage = (items) => {
  let totalWeight = 0;
  let totalVolume = 0;
  let hasHeavyUnit = false;

  items.forEach((item) => {
    const v = item.variant || {};
    const qty = item.quantity || 1;
    const unit = v.measurementUnit || "piece";

    let itemWeight = v.weight || 0;

    if (["kg", "cubicmeter", "ton"].includes(unit)) {
      hasHeavyUnit = true;
      itemWeight = itemWeight * qty;
    } else {
      itemWeight = (itemWeight || 5) * qty;
    }

    totalWeight += itemWeight;

    if (v.packageDimensions) {
      const [l, w, h] = v.packageDimensions.split("*").map(Number);
      totalVolume += (l || 10) * (w || 10) * (h || 10) * qty;
    }
  });

  const volumetricWeight = Math.round(totalVolume / 5000);

  return {
    totalWeight: Math.round(totalWeight),
    effectiveWeight: Math.max(Math.round(totalWeight), volumetricWeight),
    hasHeavyUnit,
  };
};

// {
//   "items": [ ... same as before ... ],
//   "shippingAddress": {
//     "pincode": "462001",
//     "latitude": 23.2599,      // ← User ka lat
//     "longitude": 77.4126      // ← User ka lon
//   }
// }
