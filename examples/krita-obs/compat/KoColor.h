// Yoinkr RGB-only compatibility boundary, not Krita's pigment engine.
#pragma once
#include <QColor>
#include <QMetaType>
class KoColor {
    QColor color_;
public:
    KoColor() : color_(Qt::black) {}
    explicit KoColor(const QColor &color) : color_(color) {}
    QColor toQColor() const { return color_; }
    bool operator==(const KoColor &other) const { return color_ == other.color_; }
};
Q_DECLARE_METATYPE(KoColor)
