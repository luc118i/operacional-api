import { Request, Response } from "express";
import { updateSchemePointsDerivedFields } from "../schemePoints/schemePoints.service";

export async function debugRecalcDerivedHandler(req: Request, res: Response) {
  const { schemeId } = req.params;

  if (!schemeId) {
    return res.status(400).json({
      ok: false,
      message: "schemeId é obrigatório",
    });
  }

  const result = await updateSchemePointsDerivedFields(schemeId);

  return res.json({
    ok: true,
    schemeId,
    result,
  });
}
