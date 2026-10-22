// New host boundary. Standard QColor HSV/RGB only; no ICC/HDR/proofing emulation.
#pragma once
#include <QObject>
#include "KoColor.h"
class KoColorDisplayRendererInterface : public QObject {
public:
    KoColor fromHsv(int h,int s,int v,int a=255) const {
        return KoColor(QColor::fromHsv(qBound(0,h,359),qBound(0,s,255),qBound(0,v,255),qBound(0,a,255)));
    }
    QColor toQColor(const KoColor &color) const { return color.toQColor(); }
    void getHsv(const KoColor &color,int *h,int *s,int *v,int *a=nullptr) const { color.toQColor().getHsv(h,s,v,a); }
};
class KoDumbColorDisplayRenderer : public KoColorDisplayRendererInterface {
public:
    static KoColorDisplayRendererInterface *instance() { static KoDumbColorDisplayRenderer renderer;return &renderer; }
};
