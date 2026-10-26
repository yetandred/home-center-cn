import { RELATIONSHIPS, toDateInput } from "@/lib/health"
import type { FieldConfig, FormValues } from "@/lib/form-types"
import type { Person } from "@/app/generated/prisma/client"

export function personFields(providers: { id: string; name: string }[]): FieldConfig[] {
  return [
    { name: "name", label: "姓名", kind: "text", required: true, placeholder: "王小明", wide: true },
    { name: "relationship", label: "关系", kind: "select", required: true, options: RELATIONSHIPS },
    { name: "dateOfBirth", label: "出生日期", kind: "date" },
    { name: "sex", label: "性别", kind: "text", placeholder: "女" },
    { name: "bloodType", label: "血型", kind: "text", placeholder: "O+" },
    {
      name: "primaryProviderId", label: "家庭医生", kind: "select", wide: true,
      options: providers.map((p) => ({ value: p.id, label: p.name })),
    },
    { name: "notes", label: "备注", kind: "textarea", wide: true },
  ]
}

export function personInitial(person?: Person | null): FormValues {
  return {
    name: person?.name ?? "",
    relationship: person?.relationship ?? "SELF",
    dateOfBirth: toDateInput(person?.dateOfBirth),
    sex: person?.sex ?? "",
    bloodType: person?.bloodType ?? "",
    primaryProviderId: person?.primaryProviderId ?? "",
    notes: person?.notes ?? "",
  }
}
