/* Yoinkr host/annotation code, GPL-3.0-only. Original Krita widget code is
 * compiled separately, unchanged, with its original LGPL notices. */
#include <obs-module.h>
#include <obs-frontend-api.h>
#include <graphics/graphics.h>
#include <QApplication>
#include <QWidget>
#include <QDockWidget>
#include <QPainter>
#include <QMouseEvent>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QPushButton>
#include <QSlider>
#include <QLabel>
#include <QComboBox>
#include <QFileDialog>
#include <QImage>
#include <QPointer>
#include <deque>
#include <mutex>
#include <algorithm>
#include "KoTriangleColorSelector.h"

OBS_DECLARE_MODULE()
MODULE_EXPORT const char *obs_module_description(void) { return "Krita's original triangle color selector in a live OBS annotation dock"; }
MODULE_EXPORT const char *obs_module_name(void) { return "Yoinkr · Krita color and live ink"; }

namespace {
constexpr int W=1280,H=720,HistoryLimit=16;
std::mutex imageMutex;
QImage layer(W,H,QImage::Format_ARGB32_Premultiplied);
uint64_t revision=0;
QPointer<QWidget> dockContent;bool frontendExited=false;

class InkCanvas final : public QWidget {
    QColor color{255,204,51};int brushWidth=12;bool pressed=false;QPointF previous;int points=0;
    QString mode="Pen";
    std::deque<QImage> undoStack,redoStack;
    QPointF logical(const QPointF &p) const { return {std::clamp(p.x()/std::max(1,width())*W,0.0,double(W)),std::clamp(p.y()/std::max(1,height())*H,0.0,double(H))}; }
    void remember() {
        std::lock_guard<std::mutex> guard(imageMutex);
        undoStack.push_back(layer);if(undoStack.size()>HistoryLimit)undoStack.pop_front();redoStack.clear();
    }
    void segment(const QPointF &from,const QPointF &to) {
        std::lock_guard<std::mutex> guard(imageMutex);
        // QImage detaches here, preserving bounded undo snapshots and the render-thread copy.
        QPainter painter(&layer);painter.setRenderHint(QPainter::Antialiasing);
        QColor ink=color;
        if(mode=="Marker")ink.setAlpha(96);
        if(mode=="Eraser")painter.setCompositionMode(QPainter::CompositionMode_Clear);
        painter.setPen(QPen(ink,brushWidth*(mode=="Marker"?3:1),Qt::SolidLine,Qt::RoundCap,Qt::RoundJoin));
        painter.drawLine(from,to);revision++;
    }
public:
    InkCanvas() { setObjectName("yoinkrInkCanvas");setMinimumSize(400,225);setSizePolicy(QSizePolicy::Expanding,QSizePolicy::Expanding); }
    void setColor(const QColor &next){color=next;}
    void setWidth(int width){brushWidth=width;}
    void setMode(const QString &next){mode=next;pressed=false;}
    void clear(){pressed=false;remember();{std::lock_guard<std::mutex> guard(imageMutex);layer.fill(Qt::transparent);revision++;}update();}
    void undo(){pressed=false;if(undoStack.empty())return;{std::lock_guard<std::mutex> guard(imageMutex);redoStack.push_back(layer);layer=undoStack.back();undoStack.pop_back();revision++;}update();}
    void redo(){pressed=false;if(redoStack.empty())return;{std::lock_guard<std::mutex> guard(imageMutex);undoStack.push_back(layer);layer=redoStack.back();redoStack.pop_back();revision++;}update();}
    QImage snapshot() const {std::lock_guard<std::mutex> guard(imageMutex);return layer;}
protected:
    void paintEvent(QPaintEvent *) override {
        QPainter painter(this);
        for(int y=0;y<height();y+=16)for(int x=0;x<width();x+=16)painter.fillRect(x,y,16,16,((x/16+y/16)%2)?QColor(48,53,63):QColor(34,39,49));
        painter.drawImage(rect(),snapshot());
    }
    void mousePressEvent(QMouseEvent *event) override {
        if(event->button()!=Qt::LeftButton)return;
        remember();pressed=true;points=0;previous=logical(event->position());segment(previous,previous+QPointF(.01,.01));update();
    }
    void mouseMoveEvent(QMouseEvent *event) override {
        if(!pressed||!(event->buttons()&Qt::LeftButton))return;
        if(++points>10000){pressed=false;return;}
        auto next=logical(event->position());segment(previous,next);previous=next;update();
    }
    void mouseReleaseEvent(QMouseEvent *event) override {if(event->button()==Qt::LeftButton)pressed=false;}
};

struct Source {gs_texture_t *texture=nullptr;uint64_t seen=UINT64_MAX;};
const char *sourceName(void *) {return "Yoinkr · Krita live ink";}
void *createSource(obs_data_t *,obs_source_t *) {return new Source;}
void destroySource(void *data) {auto source=static_cast<Source *>(data);obs_enter_graphics();if(source->texture)gs_texture_destroy(source->texture);obs_leave_graphics();delete source;}
uint32_t sourceWidth(void *) {return W;}
uint32_t sourceHeight(void *) {return H;}
void renderSource(void *data,gs_effect_t *) {
    auto source=static_cast<Source *>(data);QImage frame;uint64_t version;
    {std::lock_guard<std::mutex> guard(imageMutex);version=revision;if(source->seen!=version)frame=layer;}
    if(!frame.isNull()){
        const uint8_t *bits=frame.constBits();
        if(!source->texture)source->texture=gs_texture_create(W,H,GS_BGRA,1,&bits,GS_DYNAMIC);
        else gs_texture_set_image(source->texture,bits,frame.bytesPerLine(),false);
        source->seen=version;
    }
    if(!source->texture)return;
    gs_blend_state_push();gs_blend_function(GS_BLEND_ONE,GS_BLEND_INVSRCALPHA);
    auto effect=obs_get_base_effect(OBS_EFFECT_DEFAULT);
    gs_effect_set_texture(gs_effect_get_param_by_name(effect,"image"),source->texture);
    while(gs_effect_loop(effect,"Draw"))gs_draw_sprite(source->texture,0,W,H);
    gs_blend_state_pop();
}

void seedLab(obs_frontend_event event,void *) {
    if(event==OBS_FRONTEND_EVENT_EXIT){frontendExited=true;return;}
    if(event!=OBS_FRONTEND_EVENT_FINISHED_LOADING||qEnvironmentVariable("YOINKR_LAB")!="1")return;
    auto current=obs_frontend_get_current_scene();
    if(!current){auto scene=obs_scene_create("Yoinkr live overlay");current=obs_source_get_ref(obs_scene_get_source(scene));obs_frontend_set_current_scene(current);obs_scene_release(scene);}
    auto scene=obs_scene_from_source(current);
    if(scene&&!obs_scene_find_source(scene,"Krita live ink")){
        auto source=obs_get_source_by_name("Krita live ink");
        if(!source)source=obs_source_create("yoinkr_krita_ink","Krita live ink",nullptr,nullptr);
        if(source){obs_scene_add(scene,source);obs_source_release(source);}
    }
    if(current)obs_source_release(current);
    if(dockContent){auto dock=qobject_cast<QDockWidget *>(dockContent->parentWidget());if(dock){if(!dock->isVisible()){dock->setFloating(true);dock->resize(1000,600);}dock->show();}}
}
}

bool obs_module_load(void) {
    if(!obs_frontend_get_main_window())return false;
    {std::lock_guard<std::mutex> guard(imageMutex);layer.fill(Qt::transparent);revision++;}
    auto container=new QWidget;dockContent=container;container->setObjectName("yoinkrKritaDock");
    auto layout=new QVBoxLayout(container);
    auto heading=new QLabel("Krita color · Live ink");heading->setStyleSheet("font-size:18px;font-weight:600");layout->addWidget(heading);
    auto note=new QLabel("Pick a color with Krita's original wheel. Draw here; add a Yoinkr · Krita live ink source to your OBS scene.");note->setWordWrap(true);layout->addWidget(note);
    auto body=new QHBoxLayout;layout->addLayout(body,1);
    auto palette=new QVBoxLayout;body->addLayout(palette);
    auto selector=new KoTriangleColorSelector(container);selector->setObjectName("yoinkrKritaColorSelector");selector->setFixedSize(224,224);palette->addWidget(selector);
    auto swatch=new QLabel;swatch->setObjectName("yoinkrColorValue");swatch->setAlignment(Qt::AlignCenter);swatch->setMinimumHeight(32);palette->addWidget(swatch);
    auto mode=new QComboBox;mode->setObjectName("yoinkrBrushMode");mode->addItems({"Pen","Marker","Eraser"});palette->addWidget(mode);
    palette->addWidget(new QLabel("Brush width"));auto width=new QSlider(Qt::Horizontal);width->setObjectName("yoinkrBrushWidth");width->setRange(2,64);width->setValue(12);palette->addWidget(width);palette->addStretch();
    auto canvas=new InkCanvas;body->addWidget(canvas,1);
    QObject::connect(selector,&KoTriangleColorSelector::colorChanged,canvas,[canvas,swatch](const QColor &color){canvas->setColor(color);swatch->setText(color.name(QColor::HexRgb));swatch->setStyleSheet("background:"+color.name()+";color:"+(color.lightness()>128?"#101010":"#ffffff")+";border-radius:4px;padding:4px;");});
    selector->setHSV(46,204,255);
    QObject::connect(width,&QSlider::valueChanged,canvas,[canvas](int value){canvas->setWidth(value);});
    QObject::connect(mode,&QComboBox::currentTextChanged,canvas,[canvas](const QString &value){canvas->setMode(value);});
    auto buttons=new QHBoxLayout;layout->addLayout(buttons);
    auto addButton=[&](const char *label,const char *name,auto action){auto button=new QPushButton(label);button->setObjectName(name);QObject::connect(button,&QPushButton::clicked,canvas,action);buttons->addWidget(button);};
    addButton("Undo","yoinkrUndo",[canvas]{canvas->undo();});addButton("Redo","yoinkrRedo",[canvas]{canvas->redo();});addButton("Clear","yoinkrClear",[canvas]{canvas->clear();});
    addButton("Save transparent PNG…","yoinkrSavePng",[canvas]{auto path=QFileDialog::getSaveFileName(canvas,"Save annotation layer",QString(),"PNG image (*.png)");if(!path.isEmpty())canvas->snapshot().save(path,"PNG");});
    auto scope=new QLabel("Original Krita selector · RGB host adapter · New OBS drawing engine · Session-only shared layer");scope->setWordWrap(true);layout->addWidget(scope);
    if(!obs_frontend_add_dock_by_id("yoinkr-krita-ink","Krita color · Live ink",container)){delete container;return false;}
    static obs_source_info info={};info.id="yoinkr_krita_ink";info.type=OBS_SOURCE_TYPE_INPUT;info.output_flags=OBS_SOURCE_VIDEO|OBS_SOURCE_CUSTOM_DRAW;
    info.get_name=sourceName;info.create=createSource;info.destroy=destroySource;info.get_width=sourceWidth;info.get_height=sourceHeight;info.video_render=renderSource;obs_register_source(&info);obs_frontend_add_event_callback(seedLab,nullptr);
    blog(LOG_INFO,"[yoinkr] Original Krita triangle selector + OBS live ink loaded (RGB-only host)");
    return true;
}
void obs_module_unload(void) {if(!frontendExited){obs_frontend_remove_event_callback(seedLab,nullptr);obs_frontend_remove_dock("yoinkr-krita-ink");}dockContent=nullptr;}
