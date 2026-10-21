/* Yoinkr OBS recipient adapter. Generated package contains GPL GIMP code.
 * This source is experimental until compiled and accepted in actual OBS. */
#include <obs-module.h>
#include <obs-frontend-api.h>
#include <graphics/graphics.h>
#include <QWidget>
#include <QPainter>
#include <QMouseEvent>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QPushButton>
#include <QSlider>
#include <QLabel>
#include <QImage>
#include <QElapsedTimer>
#include <mutex>
#include <memory>
#include <algorithm>
#include <cmath>
#include "smoothing.h"
OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE("yoinkr-annotation", "en-US")
MODULE_EXPORT const char *obs_module_description(void){return "GIMP-derived smooth live annotation layer (experimental)";}
namespace {
constexpr int W=1920,H=1080;
std::mutex pixelsMutex;QImage pixels(W,H,QImage::Format_ARGB32);uint64_t revision=0;
class Canvas final:public QWidget {
 YoinkrSmoother *s=nullptr;bool drawing=false;QPointF previous,rawPrevious;QElapsedTimer clock;int quality=20,penWidth=8;double weight=50;int count=0;
 void newSmoother(){yoinkr_smoother_free(s);s=yoinkr_smoother_new(1,quality,weight);drawing=false;}
 QPointF logical(QPointF p){return {std::clamp(p.x()/std::max(1,this->width())*W,0.0,double(W)),std::clamp(p.y()/std::max(1,this->height())*H,0.0,double(H))};}
public:
 Canvas(){setMinimumSize(320,180);setMouseTracking(false);newSmoother();}
 ~Canvas() override{yoinkr_smoother_free(s);}
 void setQuality(int q){quality=q;newSmoother();}
 void setWeight(int q){weight=q;newSmoother();}
 void clear(){std::lock_guard<std::mutex> guard(pixelsMutex);pixels.fill(Qt::transparent);revision++;update();}
protected:
 void paintEvent(QPaintEvent *) override{QPainter p(this);p.fillRect(rect(),QColor(27,33,42));std::lock_guard<std::mutex> guard(pixelsMutex);p.drawImage(rect(),pixels);}
 void mousePressEvent(QMouseEvent *e) override{if(e->button()!=Qt::LeftButton)return;newSmoother();yoinkr_smoother_reset(s);previous=rawPrevious=logical(e->position());double x,y;drawing=yoinkr_smoother_feed(s,previous.x(),previous.y(),0,&x,&y);count=0;clock.restart();}
 void mouseMoveEvent(QMouseEvent *e) override{
  if(!drawing||!(e->buttons()&Qt::LeftButton)||++count>10000){drawing=false;return;}
  const QPointF raw=logical(e->position());double dx=raw.x()-rawPrevious.x(),dy=raw.y()-rawPrevious.y();
  // New OBS input adapter: normalized pointer speed. GIMP's input pipeline is
  // not transplanted; equal raw x/y/velocity traces are the core parity contract.
  const double velocity=std::clamp(std::hypot(dx,dy)/(std::max<qint64>(1,clock.restart())*2.0),0.0,1.0);rawPrevious=raw;
  double x,y;if(!yoinkr_smoother_feed(s,raw.x(),raw.y(),velocity,&x,&y)){drawing=false;return;}
  QPointF next(x,y);{std::lock_guard<std::mutex> guard(pixelsMutex);QPainter p(&pixels);p.setRenderHint(QPainter::Antialiasing);p.setPen(QPen(QColor(255,210,80),penWidth,Qt::SolidLine,Qt::RoundCap,Qt::RoundJoin));p.drawLine(previous,next);revision++;}previous=next;update();
 }
 void mouseReleaseEvent(QMouseEvent *) override{drawing=false;}
};
struct Source{gs_texture_t *texture=nullptr;uint64_t seen=UINT64_MAX;};
const char *sourceName(void *){return "Yoinkr smooth annotations (experimental)";}
void *createSource(obs_data_t *,obs_source_t *){return new Source;}
void destroySource(void *data){auto s=static_cast<Source *>(data);obs_enter_graphics();gs_texture_destroy(s->texture);obs_leave_graphics();delete s;}
uint32_t sourceWidth(void *){return W;}uint32_t sourceHeight(void *){return H;}
void renderSource(void *data,gs_effect_t *){
 auto s=static_cast<Source *>(data);QImage frame;uint64_t current;{std::lock_guard<std::mutex> guard(pixelsMutex);current=revision;if(s->seen!=current)frame=pixels;}
 if(!frame.isNull()){const uint8_t *bits=frame.constBits();if(!s->texture)s->texture=gs_texture_create(W,H,GS_BGRA,1,&bits,GS_DYNAMIC);else gs_texture_set_image(s->texture,bits,frame.bytesPerLine(),false);s->seen=current;}
 if(s->texture)obs_source_draw(s->texture,0,0,W,H,false);
}
}
bool obs_module_load(void){
 if(!obs_frontend_get_main_window())return false;{std::lock_guard<std::mutex> guard(pixelsMutex);pixels.fill(Qt::transparent);}
 static obs_source_info info={};info.id="yoinkr_smooth_annotations";info.type=OBS_SOURCE_TYPE_INPUT;info.output_flags=OBS_SOURCE_VIDEO|OBS_SOURCE_CUSTOM_DRAW;info.get_name=sourceName;info.create=createSource;info.destroy=destroySource;info.get_width=sourceWidth;info.get_height=sourceHeight;info.video_render=renderSource;
 auto container=new QWidget;auto layout=new QVBoxLayout(container);auto label=new QLabel("Draw here; add a Yoinkr smooth annotations source to your scene.");label->setWordWrap(true);layout->addWidget(label);auto canvas=new Canvas;layout->addWidget(canvas);
 for(int field=0;field<2;field++){layout->addWidget(new QLabel(field?"Stroke weight":"Smoothing quality"));auto slider=new QSlider(Qt::Horizontal);slider->setRange(field?3:1,field?1000:100);slider->setValue(field?50:20);QObject::connect(slider,&QSlider::valueChanged,canvas,[canvas,field](int v){if(field)canvas->setWeight(v);else canvas->setQuality(v);});layout->addWidget(slider);}
 auto clear=new QPushButton("Clear annotation layer");QObject::connect(clear,&QPushButton::clicked,canvas,[canvas]{canvas->clear();});layout->addWidget(clear);
 if(!obs_frontend_add_dock_by_id("yoinkr-annotation","Smooth annotations",container)){delete container;return false;}
 obs_register_source(&info);
 blog(LOG_INFO,"[yoinkr] Experimental GIMP smoothing annotation source loaded");return true;
}
void obs_module_unload(void){obs_frontend_remove_dock("yoinkr-annotation");}
