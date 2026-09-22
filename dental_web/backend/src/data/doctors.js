export const DOCTORS = [
  {
    id: "dr-chandu-reddy",
    name: "Dr. Chandu Reddy",
    specialization:
      "Chief Dental Surgeon",
    experience:
      "10+ Years Experience",
    qualification: "BDS",
    focus:
      "General Dentistry & Oral Care",
    startTime: "10:00",
    endTime: "19:30",
    workingDays: [
      0,
      1,
      2,
      3,
      4,
      5,
      6,
    ],
    image:
      "https://placehold.co/600x600/f5f1e8/0f3028?text=Dr.+Chandu+Reddy",
    demo: true,
  },

  {
    id: "dr-priya-sharma",
    name: "Dr. Priya Sharma",
    specialization:
      "Orthodontist",
    experience:
      "8+ Years Experience",
    qualification:
      "BDS, MDS Orthodontics",
    focus:
      "Braces & Clear Aligners",
    startTime: "10:00",
    endTime: "19:30",
    workingDays: [
      0,
      1,
      2,
      3,
      4,
      5,
      6,
    ],
    image:
      "https://placehold.co/600x600/f5f1e8/0f3028?text=Dr.+Priya+Sharma",
    demo: true,
  },

  {
    id: "dr-arjun-mehta",
    name: "Dr. Arjun Mehta",
    specialization:
      "Endodontist",
    experience:
      "9+ Years Experience",
    qualification:
      "BDS, MDS Endodontics",
    focus:
      "Root Canal Treatment",
    startTime: "10:00",
    endTime: "19:30",
    workingDays: [
      0,
      1,
      2,
      3,
      4,
      5,
      6,
    ],
    image:
      "https://placehold.co/600x600/f5f1e8/0f3028?text=Dr.+Arjun+Mehta",
    demo: true,
  },

  {
    id: "dr-sneha-iyer",
    name: "Dr. Sneha Iyer",
    specialization:
      "Periodontist",
    experience:
      "7+ Years Experience",
    qualification:
      "BDS, MDS Periodontics",
    focus:
      "Gum Care & Dental Implants",
    startTime: "10:00",
    endTime: "19:30",
    workingDays: [
      0,
      1,
      2,
      3,
      4,
      5,
      6,
    ],
    image:
      "https://placehold.co/600x600/f5f1e8/0f3028?text=Dr.+Sneha+Iyer",
    demo: true,
  },
];

export function getDoctorByName(name) {
  return DOCTORS.find((doctor) => doctor.name === name);
}
