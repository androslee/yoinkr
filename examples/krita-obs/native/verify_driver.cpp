// Test-only OBS module. Drives the real Qt widgets and reads actual GPU output.
// This observer is never included in the normal launcher configuration.
#include <obs-module.h>
#include <obs-frontend-api.h>
#include <graphics/graphics.h>
#include <graphics/vec4.h>
#include <QApplication>
#include <QTimer>
#include <QDialog>
#include <QDockWidget>
#include <QWidget>
#include <QPushButton>
#include <QLabel>
#include <QComboBox>
#include <QMouseEvent>
#include <QImage>
#include <QPixmap>
#include <QTest>
#include <QSignalSpy>
#include <QJsonObject>
#include <QJsonArray>
#include <QJsonDocument>
#include <QSaveFile>
#include <QDir>
#include <stdexcept>
#include <functional>

OBS_DECLARE_MODULE()
namespace {
constexpr int W=1280,H=720;
QJsonArray passed;QString failure;
void expect(bool ok,const char *message){if(!ok)throw std::runtime_error(message);}
void check(const char *name,const std::function<void()> &fn){fn();passed.append(name);blog(LOG_INFO,"[yoinkr-test] PASS %s",name);}
QImage render(obs_source_t *source){
    obs_enter_graphics();auto target=gs_texrender_create(GS_RGBA,GS_ZS_NONE);auto stage=gs_stagesurface_create(W,H,GS_RGBA);QImage result;
    gs_projection_push();gs_matrix_push();
    if(gs_texrender_begin(target,W,H)){
        vec4 transparent{};gs_clear(GS_CLEAR_COLOR,&transparent,0,0);gs_ortho(0,W,0,H,-100,100);gs_matrix_identity();
        obs_source_video_render(source);gs_texrender_end(target);
        gs_stage_texture(stage,gs_texrender_get_texture(target));uint8_t *data=nullptr;uint32_t stride=0;
        if(gs_stagesurface_map(stage,&data,&stride)){result=QImage(data,W,H,stride,QImage::Format_RGBA8888).copy();gs_stagesurface_unmap(stage);}
    }
    gs_matrix_pop();gs_projection_pop();gs_stagesurface_destroy(stage);gs_texrender_destroy(target);obs_leave_graphics();return result;
}
int inkPixels(const QImage &frame){int count=0;for(int y=0;y<frame.height();y++)for(int x=0;x<frame.width();x++)if(frame.pixelColor(x,y).alpha()>0)count++;return count;}
void drag(QWidget *widget,QPointF from,QPointF to){
    QMouseEvent down(QEvent::MouseButtonPress,from,widget->mapToGlobal(from.toPoint()),Qt::LeftButton,Qt::LeftButton,Qt::NoModifier);QApplication::sendEvent(widget,&down);
    for(int index=1;index<=12;index++){
        auto point=from+(to-from)*(index/12.0);QMouseEvent move(QEvent::MouseMove,point,widget->mapToGlobal(point.toPoint()),Qt::NoButton,Qt::LeftButton,Qt::NoModifier);QApplication::sendEvent(widget,&move);
    }
    QMouseEvent up(QEvent::MouseButtonRelease,to,widget->mapToGlobal(to.toPoint()),Qt::LeftButton,Qt::NoButton,Qt::NoModifier);QApplication::sendEvent(widget,&up);
}
template<typename T>T *find(const char *name){auto main=static_cast<QWidget *>(obs_frontend_get_main_window());auto object=main?main->findChild<T *>(name):nullptr;expect(object,"Expected native Qt widget missing");return object;}
void finish(){
    const QString output=qEnvironmentVariable("YOINKR_VERIFY_OUT");QDir().mkpath(output);
    QJsonObject result{{"schema",1},{"mode",qEnvironmentVariable("YOINKR_VERIFY_BASELINE")=="1"?"rollback":"feature"},{"status",failure.isEmpty()?"passed":"failed"},{"checks",passed},{"failure",failure},{"qtVersion",qVersion()},{"obsVersion",obs_get_version_string()},{"scope","Actual OBS Qt dock, unchanged Krita widget, RGB-only host, real GPU scene/source frames and lifecycle. Full original Krita app, ICC/HDR, Krita brush engine and other platforms are not established."}};
    QSaveFile file(output+"/RESULT.json");if(file.open(QIODevice::WriteOnly)){file.write(QJsonDocument(result).toJson());file.commit();}
    QTimer::singleShot(100,qApp,[]{static_cast<QWidget *>(obs_frontend_get_main_window())->close();});
}
void run(){
    obs_scene_t *scene=nullptr;obs_source_t *source=nullptr;obs_sceneitem_t *item=nullptr;
    try{
        if(qEnvironmentVariable("YOINKR_VERIFY_FRESH")=="1"){
            check("Fresh portable launcher opens without a setup dialog",[]{expect(QApplication::activeModalWidget()==nullptr,"Unexpected first-run dialog");});
            check("Fresh lab does not create microphone or desktop-audio capture",[]{for(uint32_t channel=1;channel<=6;channel++){auto audio=obs_get_output_source(channel);bool empty=audio==nullptr;if(audio)obs_source_release(audio);expect(empty,"Unexpected automatic audio source");}});
        }
        for(auto widget:QApplication::topLevelWidgets())if(auto dialog=qobject_cast<QDialog *>(widget))dialog->reject();
        if(qEnvironmentVariable("YOINKR_VERIFY_BASELINE")=="1"){
            auto main=static_cast<QWidget *>(obs_frontend_get_main_window());
            check("Restored OBS starts normally without the recovered widget",[&]{expect(main&&main->isVisible(),"OBS main window unavailable");expect(!main->findChild<QWidget *>("yoinkrKritaColorSelector"),"Recovered widget still installed");});
            check("Rollback removes only the example source registration",[&]{const char *id=nullptr;bool custom=false,ordinary=false;for(size_t index=0;obs_enum_input_types(index,&id);index++){if(QString(id)=="yoinkr_krita_ink")custom=true;if(QString(id)=="image_source")ordinary=true;}expect(!custom,"Example source still registered");expect(ordinary,"Ordinary OBS sources missing");});
            finish();return;
        }
        auto content=find<QWidget>("yoinkrKritaDock");auto selector=find<QWidget>("yoinkrKritaColorSelector");auto canvas=find<QWidget>("yoinkrInkCanvas");
        auto dock=qobject_cast<QDockWidget *>(content->parentWidget());if(dock){dock->setFloating(true);dock->resize(1000,600);dock->show();}content->show();
        check("Actual OBS loads the plugin and original Krita Qt class",[&]{expect(QString(selector->metaObject()->className())=="KoTriangleColorSelector","Wrong selector implementation");expect(content->isVisible(),"Dock hidden");});
        check("Lab startup creates a ready-to-use OBS ink source",[&]{auto initial=obs_get_source_by_name("Krita live ink");expect(initial,"Lab source not created");expect(QString(obs_source_get_id(initial))=="yoinkr_krita_ink","Wrong lab source type");obs_source_release(initial);});
        auto color=find<QLabel>("yoinkrColorValue");
        check("Original selector preserves standard RGB HSV values and bounds",[&]{for(int hue: {0,60,120,180,240,300,359})for(int saturation:{0,128,255})for(int value:{0,128,255}){QMetaObject::invokeMethod(selector,"setHSV",Q_ARG(int,hue),Q_ARG(int,saturation),Q_ARG(int,value));expect(color->text()==QColor::fromHsv(hue,saturation,value).name(),"HSV parity failed");}QMetaObject::invokeMethod(selector,"setHSV",Q_ARG(int,-10),Q_ARG(int,400),Q_ARG(int,400));expect(color->text()=="#ff0000","HSV clamp failed");});
        check("Original Krita HSV slots and colorChanged signal reach the OBS brush",[&]{QSignalSpy spy(selector,SIGNAL(colorChanged(QColor)));expect(spy.isValid(),"Original color signal missing");expect(QMetaObject::invokeMethod(selector,"setHSV",Q_ARG(int,300),Q_ARG(int,255),Q_ARG(int,255)),"Original HSV slot missing");expect(spy.count()>=1,"No color signal");expect(color->text()=="#ff00ff","Wrong RGB adapter output");});
        check("Original Krita wheel responds to real Qt mouse events",[&]{QTest::mouseClick(selector,Qt::LeftButton,Qt::NoModifier,QPoint(10,112));expect(color->text()!="#ff00ff","Hue wheel did not change color");QMetaObject::invokeMethod(selector,"setHSV",Q_ARG(int,300),Q_ARG(int,255),Q_ARG(int,255));});
        scene=obs_scene_create("Yoinkr native acceptance");source=obs_source_create("yoinkr_krita_ink","Yoinkr acceptance ink",nullptr,nullptr);expect(scene&&source,"OBS source registration failed");item=obs_scene_add(scene,source);obs_frontend_set_current_scene(obs_scene_get_source(scene));
        auto button=[&](const char *name){find<QPushButton>(name)->click();};button("yoinkrClear");
        check("Real OBS scene starts with a fully transparent annotation source",[&]{expect(obs_source_get_width(source)==W&&obs_source_get_height(source)==H,"Wrong source dimensions");auto image=render(obs_scene_get_source(scene));expect(!image.isNull(),"GPU readback failed");expect(inkPixels(image)==0,"Empty layer is not transparent");});
        drag(canvas,QPointF(canvas->width()*.2,canvas->height()*.3),QPointF(canvas->width()*.75,canvas->height()*.65));
        const QImage drawn=render(obs_scene_get_source(scene));
        check("OBS scene renders stroke pixels in the selected Krita color",[&]{expect(inkPixels(drawn)>1000,"Stroke absent from GPU scene output");int magenta=0;for(int y=0;y<H;y++)for(int x=0;x<W;x++){auto pixel=drawn.pixelColor(x,y);if(pixel.alpha()>240&&pixel.red()>240&&pixel.blue()>240&&pixel.green()<20)magenta++;}expect(magenta>1000,"Selected color did not reach scene output");expect(drawn.pixelColor(0,0).alpha()==0,"Background alpha lost");});
        check("Transparent ink composites over another real OBS source",[&]{auto settings=obs_data_create();obs_data_set_int(settings,"width",W);obs_data_set_int(settings,"height",H);obs_data_set_int(settings,"color",0xff804020);auto background=obs_source_create_private("color_source_v3","Backdrop",settings);obs_data_release(settings);expect(background,"Color source unavailable");auto backgroundItem=obs_scene_add(scene,background);obs_sceneitem_set_order(backgroundItem,OBS_ORDER_MOVE_BOTTOM);auto combined=render(obs_scene_get_source(scene));expect(combined.pixelColor(0,0).alpha()==255,"Background did not composite");expect(combined!=drawn,"Scene ignored background");obs_sceneitem_remove(backgroundItem);obs_source_release(background);expect(render(obs_scene_get_source(scene))==drawn,"Background removal changed ink");});
        check("Undo and redo restore the actual rendered source",[&]{button("yoinkrUndo");expect(inkPixels(render(source))==0,"Undo failed");button("yoinkrRedo");expect(render(source)==drawn,"Redo differs from original pixels");});
        check("Marker draws a translucent layer and eraser removes alpha",[&]{button("yoinkrClear");find<QComboBox>("yoinkrBrushMode")->setCurrentText("Marker");drag(canvas,{100,100},{200,100});auto marker=render(source);int translucent=0;for(int y=0;y<H;y++)for(int x=0;x<W;x++){int alpha=marker.pixelColor(x,y).alpha();if(alpha>0&&alpha<200)translucent++;}expect(translucent>100,"Marker opacity missing");find<QComboBox>("yoinkrBrushMode")->setCurrentText("Eraser");drag(canvas,{100,100},{200,100});expect(inkPixels(render(source))<inkPixels(marker),"Eraser did not clear alpha");find<QComboBox>("yoinkrBrushMode")->setCurrentText("Pen");});
        check("Multiple real OBS source instances render the shared layer",[&]{for(int index=0;index<12;index++){auto another=obs_source_create_private("yoinkr_krita_ink","Repeated source",nullptr);expect(another,"Repeated source failed");expect(render(another)==render(source),"Source instance differs");obs_source_release(another);}});
        check("Dock hide and reopen preserve current session state",[&]{auto before=render(source);if(dock){dock->hide();dock->show();}expect(render(source)==before,"Dock visibility lost pixels");});
        button("yoinkrClear");QMetaObject::invokeMethod(selector,"setHSV",Q_ARG(int,185),Q_ARG(int,200),Q_ARG(int,240));drag(canvas,{100,100},{300,180});
        const QString output=qEnvironmentVariable("YOINKR_VERIFY_OUT");QDir().mkpath(output);render(source).save(output+"/scene-layer.png");content->grab().save(output+"/dock.png");
        check("Clear returns scene output to transparent",[&]{button("yoinkrClear");expect(inkPixels(render(obs_scene_get_source(scene)))==0,"Clear failed");});
    }catch(const std::exception &error){failure=error.what();blog(LOG_ERROR,"[yoinkr-test] FAIL %s",error.what());}
    if(item)obs_sceneitem_remove(item);if(source)obs_source_release(source);if(scene)obs_scene_release(scene);
    finish();
}
}
bool obs_module_load(void){if(qEnvironmentVariable("YOINKR_VERIFY_OUT").isEmpty())return false;QTimer::singleShot(3500,qApp,run);return true;}
