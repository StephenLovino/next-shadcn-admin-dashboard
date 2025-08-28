export const crmData = [
  {
    id: "L-1007",
    name: "Stephen Lovino",
    company: "Weblabs Studio",
    status: "Won",
    value: "$12,000",
    probability: "85%",
    stage: "Contract Signed",
    source: "Website",
    assignedTo: "Stephen Lovino",
    lastContact: "2024-01-15",
    nextFollowUp: "2024-01-22",
  },
  {
    id: "L-1006",
    name: "Sarah Johnson",
    company: "TechCorp Inc",
    status: "Qualified",
    value: "$8,500",
    probability: "60%",
    stage: "Proposal Sent",
    source: "Referral",
    assignedTo: "Stephen Lovino",
    lastContact: "2024-01-14",
    nextFollowUp: "2024-01-21",
  },
  {
    id: "L-1005",
    name: "Mike Chen",
    company: "StartupXYZ",
    status: "Contacted",
    value: "$15,000",
    probability: "40%",
    stage: "Initial Contact",
    source: "LinkedIn",
    assignedTo: "Stephen Lovino",
    lastContact: "2024-01-13",
    nextFollowUp: "2024-01-20",
  },
  {
    id: "L-1004",
    name: "Emily Davis",
    company: "Enterprise Solutions",
    status: "Won",
    value: "$25,000",
    probability: "90%",
    stage: "Contract Signed",
    source: "Trade Show",
    assignedTo: "Stephen Lovino",
    lastContact: "2024-01-12",
    nextFollowUp: "2024-01-19",
  },
  {
    id: "L-1003",
    name: "David Wilson",
    company: "Innovation Labs",
    status: "Lost",
    value: "$18,000",
    probability: "0%",
    stage: "Proposal Rejected",
    source: "Cold Outreach",
    assignedTo: "Stephen Lovino",
    lastContact: "2024-01-11",
    nextFollowUp: "N/A",
  },
  {
    id: "L-1002",
    name: "Stephen Lovino",
    company: "AHA Rewards",
    status: "Contacted",
    value: "$10,000",
    probability: "50%",
    stage: "Initial Contact",
    source: "Website",
    assignedTo: "Stephen Lovino",
    lastContact: "2024-01-10",
    nextFollowUp: "2024-01-17",
  },
  {
    id: "L-1001",
    name: "Lisa Rodriguez",
    company: "Global Tech",
    status: "Qualified",
    value: "$22,000",
    probability: "70%",
    stage: "Proposal Sent",
    source: "Referral",
    assignedTo: "Stephen Lovino",
    lastContact: "2024-01-09",
    nextFollowUp: "2024-01-16",
  },
];

export const getStatusBadge = (status: string) => {
  switch (status.toLowerCase()) {
    case "won":
      return "Won";
    case "qualified":
      return "Qualified";
    case "contacted":
      return "Contacted";
    case "lost":
      return "Lost";
    default:
      return status;
  }
};
